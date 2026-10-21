import { keyOf, type Cache, type FreePlaySessions } from '@earthcation/model'
import type { Models } from '../models'
import { plain, type Fields } from './queries'

const FREE_SESSION_TTL_S = 600

// Quien juega sin código de sala cae en la sesión libre de la localidad de su perfil; sin localidad, en una
// global. Sin instructor ni código, siempre activa. Se crea la primera vez y el jugador queda inscrito.

const freeSessionDefaults = (location: Fields | null) => ({
  name: location ? `Juego libre – ${keyOf(location.municipality)}` : 'Juego libre', status: 'active', started_at: new Date(), instructor_id: null, code: null,
})

/** La sala "Juego libre" del jugador cuando el resultado o el intento llega sin sala; se cachea 10 min por jugador. */
export class SequelizeFreePlaySessions implements FreePlaySessions {
  constructor(private readonly models: Models, private readonly cache: Cache) {}

  resolve(userId: string, sessionId: unknown): Promise<unknown> {
    if (sessionId) return Promise.resolve(sessionId)
    return this.cache.remember({ namespace: 'free-session', key: userId, ttlSeconds: FREE_SESSION_TTL_S }, () => this.freeSessionFor(userId))
  }

  private async profilePlace(userId: string): Promise<Fields | null> {
    const profile = await this.models.UserProfile.findOne({ where: { user_id: userId }, include: [{ model: this.models.Location, as: 'location' }] })
    return (profile ? plain(profile).location : null) as Fields | null
  }

  private async freeSessionFor(userId: string): Promise<string> {
    const location = await this.profilePlace(userId)
    const [session] = await this.models.TrainingSession.findOrCreate({
      where: { is_free_play: true, location_id: location ? location.id : null }, defaults: freeSessionDefaults(location),
    })
    const id = keyOf(plain(session).id)
    await this.models.SessionUser.findOrCreate({ where: { session_id: id, user_id: userId } })
    return id
  }
}
