import { Logger } from 'pino'
import { writeFileSync } from 'node:fs'

export default class APITester {
  _fetch
  _logger: Logger
  _config: any

  _auth

  /**
   *
   * @param {fetch} fetch
   * @param {import('pino').Logger} logger
   * @param {any} config
   */
  constructor(fetch, logger, config) {
    this._fetch = fetch
    this._logger = logger
    this._config = config
  }

  async test() {
    this._logger.debug('test() -- start')
    let errors = {}

    try {
      // if jwt authentication is enabled request a new access_token for client
      if (this._config.request_jwt) {
        this._logger.debug('request_jwt is set, trying to request a new access_token...', { config: this._config.request_jwt })
        const res = await requestAccessToken(this._fetch, this._config.request_jwt)
        if (res.ok) {
          writeFileSync('./request_jwt.log', res.headers.raw()['set-cookie'].join(''))
          const jwt = await res.json()
          this._auth = {
            type: jwt.token_type,
            token: jwt.access_token
          }
        } else {
          this._logger.error(`Error while requesting access token: HTTP Error Response: ${res.status} ${res.statusText}`)
          throw new Error(`Error while requesting access token: HTTP Error Response: ${res.status} ${res.statusText}`)
        }
      }

      // run all tests a first time to ensure the second run ignores potential start-up delay
      // for (let controller of Object.keys(this._config.controllers)) {
      //   await this.test_controller(controller, {})
      // }

      for (let controller of Object.keys(this._config.controllers)) {
        const config = {
          ...this._config.default_options,
          ...this._config.controllers[controller]
        }
        errors[controller] = await this.test_controller(controller, config)
      }

    } catch (err) {
      return {
        name: this._config.name,
        summary: err?.message
      }
    } finally {
      if (Object.keys(errors).some(k => errors[k].length > 0)) {
        // create incident for all errors
        let controllers_with_errors = Object.keys(errors).filter(k => errors[k].length > 0)
        this._logger.debug('controllers_with_errors: ', controllers_with_errors)
        let description = '', summary = ''
        if (controllers_with_errors.length > 1) {
          // summary = 'Detected error(s) in multiple controllers'
          description += 'Detected error(s) in multiple controllers'
          for (let controller of controllers_with_errors) {
            description += controller + ':\n'
            for (let error of errors[controller]) {
              description += '- ' + error + '\n'
            }
            description += '\n'
          }
        } else {
          // summary = `Detected error(s) in controller: ${controllers_with_errors[0]}`
          description += `Detected error(s) in controller: ${controllers_with_errors[0]}`
          for (let error of errors[controllers_with_errors[0]]) {
            description += '- ' + error + '\n'
          }
        }
        description = description.trimEnd()
        this._logger.debug('Creating incident with description: %s', description)

        return {
          name: this._config.name,
          summary: 'API test failed!',
          description
        }
      }
    }
    return undefined
  }

  /**
   *
   * @param {string} controller
   * @param {any} options
   * @returns
   */
  async test_controller(controller, options) {
    let errors = []

    try {
      let url = options.user_id !== undefined ? `${controller}?uid=${options.user_id}` : controller
      // this._logger.debug('url: %s', url)
      const r = await this.get(url)
      let d = await r.json()

      // this._logger.debug({ response: d }, controller)

      if (options.check_data && (!d || !d.data)) {
        errors.push(`no data retuned!`)
      }

      if (options.check_status_code && r.status !== options.check_status_code) {
        errors.push(`did not return status code '${options.check_status}', (actual): ${r.status})!`)
      }

      if (options.check_status && d.status !== options.check_status) {
        errors.push(`did not return status '${options.check_status}'!`)
      }

      if (d.executionTime) {
        this._logger.info({
          execution_time: d.executionTime,
          endpoint: `${this._config.base_url}/${controller}`
        }, `execution info for '${this._config.base_url}/${controller}'`)
      }

      if (options.check_execution_time && d.executionTime >= options.check_execution_time) {
        // If execution time is too long, retry a second time 200ms later and check again, if still too long, throw an error with the initial value
        await new Promise(resolve => setTimeout(resolve, 200))
        const r2 = await this.get(url)
        let d2 = await r2.json()
        if (d2.executionTime >= options.check_execution_time) {
          errors.push(`execution took longer than ${options.check_execution_time}ms (actual: ${d.executionTime.toFixed(2)}ms) which is unusual!`)
        }
      }

      if (options.check_checksum && !d.checksum && !d.data?.checksum) {
        errors.push(`returned no checksum value!`)
      }

      if (options.check_response_body) {
        errors.push('option check_response_body is not yet implemented!')
      }

      if (Array.isArray(d.data)) {
        if (options.check_length && d.data.length < options.check_length) {
          errors.push(`returned less than ${options.check_length} objects (actual: ${d.data.length}) which is unusual!`)
        }

        if (options.check_object_properties) {
          let o = d.data[0]
          const m = checkMissingProps(o, options.check_object_properties)
          if (m.length > 0) {
            errors.push(`object in response is invallid, missing properties: ${JSON.stringify(m)}`)
            this._logger.warn(controller, o)
          }
        }
      } else {
        if (options.check_length && d.data.length && d.data.length < options.check_length) {
          errors.push(`returned less than ${options.check_length} objects (actual: ${d.data.length}) which is unusual!`)
        }

        if (options.check_object_name) {
          if (d.data[options.check_object_name]) {
            if (options.check_object_properties) {
              let o = Array.isArray(d.data[options.check_object_name]) ? d.data[options.check_object_name][0] : d.data[options.check_object_name]
              const m = checkMissingProps(o, options.check_object_properties)
              if (m.length > 0) {
                errors.push(`object in response is invallid, missing properties: ${JSON.stringify(m)}`)
                this._logger.warn(options.check_object_name, o)
              }
            }
          } else {
            errors.push(`object ${options.check_object_name} not found in data!`)
          }
        }
      }

      if (options.check_checksum && (d.data?.checksum || d.checksum)) {
        let check_url = url + (url.includes('?') ? '&' : '?') + 'checksum=' + (d.checksum ?? d.data.checksum)
        const x: any = await this.get(check_url)
        if (x.status !== 204) {
          errors.push(`should return 204 when providing the current checksum!`)
        }
      }
    } catch (e) {
      if (e?.message) {
        errors.push(e.message)
      } else {
        throw e
      }
    }

    return errors
  }

  /**
   * @param {string} url
   * @returns {Promise<Response>}
   */
  async get(url) {
    if (this._auth) {
      return this._fetch(`${this._config.base_url}/${url}`, {
        headers: {
          'Authorization': this._auth.type + ' ' + this._auth.token
        }
      })
    }
    return this._fetch(`${this._config.base_url}/${url}`)
  }
}

function toUrlEncoded(obj) {
  return Object.keys(obj).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(obj[k])).join('&')
}

async function requestAccessToken(fetch, config) {
  if (config.body) {
    console.log(config.endpoint, toUrlEncoded(config.body))
    return fetch(config.endpoint, {
      method: 'POST',
      Headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: toUrlEncoded(config.body)
    })
  } else {
    return fetch(config.endpoint)
  }
}

/**
 * check if all properties exist
 * @param {any} o
 * @param {string[]} p
 * @returns {string[]}
 */
function checkMissingProps(o, p) {
  return p.filter(k => {
    let x = k.split('.')
    switch (x.length) {
      case 2:
        return o[x[0]][x[1]] === undefined
      case 3:
        return o[x[0]][x[1]][x[2]] === undefined
      case 4:
        return o[x[0]][x[1]][x[2]][x[3]] === undefined
      default:
        return o[k] === undefined
    }
  })
}
