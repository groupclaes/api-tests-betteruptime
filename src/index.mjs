import fs from 'fs'
import path from 'path'
import pino from 'pino'

import { BetterUptime } from './betteruptime.mjs'
import APITester from './api-tester.mjs'

/**
 * @type {import('pino').Logger}
 */
let logger
let loggingConfig = { level: 'info' }

async function main() {
  let betteruptime
  let config
  let incidents = []

  try {
    config = await load_config()
    fetch = await load_fetch()

    if (config && config.betteruptime) {
      if (config.betteruptime.logtail)
        logger = pino(loggingConfig, pino.transport({
          target: "@logtail/pino",
          options: config.betteruptime.logtail
        }))
      else logger = pino(loggingConfig)
      logger.level = 'debug'

      betteruptime = new BetterUptime(fetch, logger, config.betteruptime)
    } else {
      if (!logger)
        logger = pino(loggingConfig)
      logger?.error(`Missing configuration for betteruptime, 'token' is a required!`)
    }

    incidents = await process(fetch, logger)
  } catch (err) {
    logger?.error(err)
  } finally {
    if (betteruptime) {
      if (incidents.length > 0) {
        if (config.betteruptime.create_incident)
          await betteruptime.create_incidents(incidents)
        else
          logger?.warn({ incidents }, 'incidents found!')
      }
      await betteruptime.heartbeat()
    } else {
      logger?.debug('completed API checks')
      if (incidents.length > 0)
        logger?.warn('incidents found!', incidents)
    }
  }
}

// dynamicly load fetch module
async function load_fetch() {
  try {
    return await import('node-fetch')
      .then(module => module.default)
  } catch (e) {
    throw new Error(`Unable to import node-fetch`)
  }
}

// dynamicly load config.json
async function load_config() {
  try {
    const config = JSON.parse(fs.readFileSync('./config.json', { encoding: 'utf-8' }))
    if (config)
      return config
    else
      throw new Error(`Unable to parse config from ./config.json`)
    // return await import('./config.json', { assert: { type: "json" } })
    //   .then(module => module.default)
  } catch (e) {
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
      if (incident)
        incidents.push(incident)
      else
        logger.debug('No incident for %s', file.name)
    } else {
      logger.warn('unsupported config file found in configs; %s', file.name)
    }
  }

  return incidents
}

await main()