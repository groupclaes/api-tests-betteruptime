import fs from 'node:fs'
import path from 'node:path'
import pino, { Logger } from 'pino'

import { BetterUptime } from './better-uptime'
import APITester from './api-tester'

let logger: Logger
let loggingConfig = { level: 'info' }

async function main() {
  let betteruptime
  let config
  let fetch
  let incidents = []

  try {
    config = await loadConfig()
    fetch = await loadFetch()

    if (config && config.betteruptime) {
      if (config.betteruptime.logtail) {
        logger = pino(loggingConfig, pino.transport({
          target: '@logtail/pino',
          options: config.betteruptime.logtail
        }))
      } else {
        logger = pino(loggingConfig)
      }
      logger.level = 'debug'

      betteruptime = new BetterUptime(fetch, logger, config.betteruptime)
    } else {
      if (!logger) {
        logger = pino(loggingConfig)
      }
      logger?.error(`Missing configuration for logtail (betteruptime), 'token' is a required!\nFalling back to local stdout logging!`)
    }

    incidents = await process(fetch, logger)
  } catch (err) {
    logger?.error(err)
  } finally {
    if (betteruptime) {
      if (incidents.length > 0) {
        if (config.betteruptime.create_incident) {
          await betteruptime.create_incidents(incidents)
        } else {
          logger?.warn({ incidents }, 'incidents found!')
        }
      }
      await betteruptime.heartbeat()
    } else {
      logger?.debug('completed API checks')
      if (incidents.length > 0) {
        logger?.warn('incidents found!', incidents)
      }
    }
  }
}

// dynamically load fetch module
async function loadFetch() {
  try {
    return await import('node-fetch')
      .then(module => module.default)
  } catch (e) {
    throw new Error(`Unable to import node-fetch`)
  }
}

// dynamically load config.json
async function loadConfig() {
  try {
    const config = JSON.parse(fs.readFileSync('./config.json', { encoding: 'utf-8' }))
    if (config) {
      return config
    } else {
      // This is stupid, we will always get the error 'Unable to import' TODO: fix this
      throw new Error(`Unable to parse config from ./config.json`)
    }
    // return await import('./config.json', { assert: { type: "json" } })
    //   .then(module => module.default)
  } catch {
    throw new Error(`Unable to import config from ./config.json`)
  }
}

async function process(fetch, logger) {
  let incidents = []

  // get all configurations declared in the 'config' folder and run checks
  const files = fs.readdirSync('./configs', { encoding: 'utf-8', recursive: false, withFileTypes: true })
  for (let file of files) {
    // check if file ext is json, then try to parse config
    if (path.parse(file.name).ext === '.json') {
      const file_config = JSON.parse(fs.readFileSync('./configs/' + file.name, { encoding: 'utf-8' }))
      logger.warn('Creating tester for file %s', file.name)
      const tester = new APITester(fetch, logger, file_config)
      logger.warn('Starting tester for file %s', file.name)
      const incident = await tester.test()
      if (incident) {
        incidents.push(incident)
      } else {
        logger.debug('No incident for %s', file.name)
      }
    } else {
      logger.warn('unsupported config file found in configs; %s', file.name)
    }
  }

  return incidents
}

await main()
