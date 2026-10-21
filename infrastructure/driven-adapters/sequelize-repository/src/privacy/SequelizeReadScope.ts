import { QueryTypes } from 'sequelize'
import type { Cache, ReadScope } from '@earthcation/model'
import type { Models } from '../models'

const TTL_SECONDS = 60

// Inscritos en las salas del instructor, más quienes juegan en el Juego libre de su localidad
const VISIBLE_PLAYERS = `
  SELECT DISTINCT su.user_id AS id
    FROM session_users su JOIN training_sessions s ON s.id = su.session_id
   WHERE s.instructor_id = :instructorId
  UNION
  SELECT DISTINCT a.user_id AS id
    FROM level_attempts a JOIN training_sessions s ON s.id = a.session_id
   WHERE s.is_free_play = true
     AND s.location_id = (SELECT location_id FROM user_profiles WHERE user_id = :instructorId)`

/** Jugadores que un instructor puede ver, con una caché de 60 s (cambia solo cuando alguien se une a una sala). */
export class SequelizeReadScope implements ReadScope {
  constructor(private readonly models: Models, private readonly cache: Cache) {}

  async visiblePlayerIds(instructorId: string): Promise<ReadonlySet<string>> {
    const ids = await this.cache.remember({ namespace: 'read-scope', key: instructorId, ttlSeconds: TTL_SECONDS }, () => this.load(instructorId))
    return new Set(ids)
  }

  private async load(instructorId: string): Promise<string[]> {
    const rows = await this.models.User.sequelize?.query<{ id: string }>(VISIBLE_PLAYERS, { replacements: { instructorId }, type: QueryTypes.SELECT })
    return (rows ?? []).map((r) => r.id)
  }
}
