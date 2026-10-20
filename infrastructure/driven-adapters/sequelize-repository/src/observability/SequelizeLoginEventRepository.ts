import type { LoginEvent, LoginEventRepository } from '@earthcation/model'
import type { Models } from '../models'

// Entidad → fila (snake_case) de login_events
const loginRow = (event: LoginEvent) => {
  const e = event.toProps()
  return {
    user_id: e.userId, role: e.role, country: e.country, region: e.region, city: e.city,
    device: e.device, os: e.os, browser: e.browser,
  }
}

export class SequelizeLoginEventRepository implements LoginEventRepository {
  constructor(private readonly models: Models) {}

  async save(event: LoginEvent): Promise<void> {
    await this.models.LoginEvent.create(loginRow(event))
  }
}
