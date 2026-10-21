import type { IncludeOptions } from 'sequelize'
import { sessionDetail, type Cache, type SessionDetail, type SessionDetailReader, type SessionRow } from '@earthcation/model'
import type { Models } from '../models'
import { plainOrNull, rows, withRiskLevel } from './queries'

const DETAIL_TTL_S = 10

const PARTICIPANT_USER = (m: Models): IncludeOptions => ({
  model: m.User, as: 'user', attributes: ['id', 'first_name', 'last_name', 'username', 'cedula'], include: [
    { association: 'varkProfile', attributes: ['dominant_style'] },
    { association: 'profile', attributes: ['organization_id'], include: [{ association: 'organization', attributes: ['id', 'name'] }] },
  ],
})

/**
 * El cómputo completo de `/progress/admin` (3 consultas + `sessionDetail` puro), compartido por el detalle, el
 * análisis por participante y el Excel: se cachea 10 s por sesión (se invalida al iniciar/terminar la sala).
 */
export class SequelizeSessionDetailReader implements SessionDetailReader {
  constructor(private readonly models: Models, private readonly cache: Cache) {}

  read(id: string): Promise<SessionDetail | null> {
    const entry = { namespace: `session:${id}`, key: 'progress-admin', ttlSeconds: DETAIL_TTL_S }
    return this.cache.remember(entry, () => this.compute(id))
  }

  private async compute(id: string): Promise<SessionDetail | null> {
    const session = await this.detailSession(id)
    if (session === null) return null
    const [results, attempts] = await Promise.all([
      rows(this.models.UserRiskProgress.findAll({ where: { session_id: id }, include: [withRiskLevel(this.models)], order: [['recorded_at', 'ASC']] })),
      rows(this.models.LevelAttempt.findAll({ where: { session_id: id }, attributes: { exclude: ['summary'] }, order: [['started_at', 'ASC']] })),
    ])
    return sessionDetail({ session, results, attempts })
  }

  private async detailSession(id: string): Promise<SessionRow | null> {
    const found = await this.models.TrainingSession.findByPk(id, {
      include: [{ model: this.models.User, as: 'instructor', attributes: ['id', 'first_name', 'last_name', 'email'] },
        { model: this.models.Location, as: 'location', attributes: ['id', 'municipality', 'department'] },
        { model: this.models.SessionUser, as: 'participants', include: [PARTICIPANT_USER(this.models)] }],
      order: [[{ model: this.models.SessionUser, as: 'participants' }, 'joined_at', 'ASC']],
    })
    return plainOrNull(found)
  }
}
