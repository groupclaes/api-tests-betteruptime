import { Logger } from 'pino'

export class BetterUptime {
  private readonly _fetch
  private readonly _logger: Logger
  private readonly _config: any
  private readonly _token: string

  constructor(fetch, logger: Logger, config?: any) {
    this._fetch = fetch
    this._logger = logger
    if (config?.token) {
      this._logger.warn('Betteruptime token in config is not recommended, removing this from object!')
      this._token = config?.token
      delete config.token
    }
    this._config = config
  }

  async createIncident(incident: IncidentOptions): Promise<boolean> {
    if (this._token) {
      throw new Error('token is required!')
    }

    if (!incident.summary || incident.summary.trim().length === 0) {
      throw new Error('summary is required!')
    }

    const body = {
      ...this._config.incident_options,
      summary: incident.summary,
      description: incident.description,
      ...incident.options
    }

    if (incident.name) {
      body.name = incident.name
    }

    const response = await this._fetch(`https://uptime.betterstack.com/api/v3/incidents`, {
      method: 'post',
      body: JSON.stringify(body),
      headers: {
        'Authorization': 'Bearer ' + this._token,
        'Content-Type': 'application/json'
      }
    })

    return response.status === 201
  }

  async createIncidents(incidents: IncidentOptions[]): Promise<void> {
    if (this._config.create_grouped_incident) {
      this._logger.error('Creating a grouped incident is not implemented, falling back to multiple incidents...')
    }

    for (let incident of incidents) {
      await this.createIncident(incident)
    }
  }

  async heartbeat(): Promise<void> {
    if (this._config.heartbeat) {
      await this._fetch('https://uptime.betterstack.com/api/v1/heartbeat/' + this._config.heartbeat, { method: 'HEAD' })
        .catch(_ => this._logger.error('Error while sending heartbeat request to betteruptime!'))
      this._logger.debug('Heartbeat request send to betteruptime!')
    }
  }
}

export interface IncidentOptions {
  name?: string
  summary: string
  description?: string
  options?: any
}
