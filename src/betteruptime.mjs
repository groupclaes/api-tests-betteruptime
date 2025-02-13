export class BetterUptime {
  _fetch
  _config
  _token

  constructor(fetch, config) {
    this._fetch = fetch
    this._config = config
    this._token = config.token
  }

  /**
   * 
   * @param {{ name?: string, summary: string, description?: string, options?: any}} incident 
   * @returns 
   */
  async create_incident(incident) {
    if (!incident.summary || incident.summary.trim().length === 0)
      throw new Error('summary is required!')

    const body = {
      ...this._config.incident_options,
      summary: incident.summary,
      description: incident.description,
      ...incident.options
    }

    if (incident.name)
      body.name = incident.name

    const response = await this._fetch(`https://uptime.betterstack.com/api/v3/incidents`, {
      method: 'post',
      body: JSON.stringify(body),
      headers: {
        'Authorization': 'Bearer ' + this._config.token,
        'Content-Type': 'application/json'
      }
    })

    return response.status === 201
  }

  /**
   * 
   * @param {{ name: string, summary: string, description?: string, options?: any}[]} incidents 
   */
  async create_incidents(incidents) {
    if (this._config.create_grouped_incident) {
      console.error('Creating a grouped incident is not implemented, falling back to multiple incidents...')
    }

    for (let incident of incidents) {
      await this.create_incident(incident)
    }
  }

  async heartbeat() {
    if (this._config.heartbeat) {
      await this._fetch('https://uptime.betterstack.com/api/v1/heartbeat/' + this._config.heartbeat, { method: 'HEAD' })
        .catch(_ => console.error('Error while sending heartbeat request to betteruptime!'))
      console.debug('Heartbeat request send to betteruptime!')
    }
  }
}