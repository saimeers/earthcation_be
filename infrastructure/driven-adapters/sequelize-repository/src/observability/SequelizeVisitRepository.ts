import type { Visit, VisitRepository } from '@earthcation/model'
import type { Models } from '../models'

// Entidad → fila (snake_case) de game_visits
const visitRow = (visit: Visit) => {
  const v = visit.toProps()
  return {
    visitor: v.visitor, is_unique: v.isUnique, version_id: v.versionId, country: v.country, region: v.region,
    city: v.city, colo: v.colo, latitude: v.latitude, longitude: v.longitude, session_code: v.sessionCode,
    asn: v.asn, as_org: v.asOrg, is_bot: v.isBot, device: v.device, os: v.os, browser: v.browser,
  }
}

export class SequelizeVisitRepository implements VisitRepository {
  constructor(private readonly models: Models) {}

  async save(visit: Visit): Promise<void> {
    await this.models.GameVisit.create(visitRow(visit))
  }
}
