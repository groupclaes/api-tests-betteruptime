import fs from 'fs'

import { BetterUptime } from './betteruptime.mjs'
import path from 'path'
import APITester from './api-tester.mjs'
import { error } from 'console'

async function main() {
  let betteruptime
  let config
  let incidents = []

  try {
    config = await load_config()
    fetch = await load_fetch()

    if (config && config.betteruptime)
      betteruptime = new BetterUptime(fetch, config.betteruptime)
    else
      console.error(`Missing configuration for betteruptime, 'token' is a required!`)

    incidents = await process(fetch)
  } catch (err) {
    console.error(err)
  } finally {
    if (betteruptime) {
      if (config.betteruptime.create_incident)
        if (incidents.length > 0)
          await betteruptime.create_incidents(incidents)
      await betteruptime.heartbeat()
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

async function process(fetch) {
  let incidents = []

  // get all configurations declared in the 'config' folder and run checks
  const files = fs.readdirSync('./configs', { encoding: 'utf-8', recursive: false, withFileTypes: true })
  for (let file of files) {
    // check if file ext is json, then try to parse config
    if (path.parse(file.name).ext === '.json') {
      const file_config = JSON.parse(fs.readFileSync('./configs/' + file.name, { encoding: 'utf-8' }))
      const tester = new APITester(fetch, file_config)
      const incident = await tester.test()
      if (incident)
        incidents.push(incident)
      else
        console.debug('No incident for %s', file.name)
    } else {
      console.warn('unsupported config file found in configs; %s')
    }
  }

  return incidents
}

await main()