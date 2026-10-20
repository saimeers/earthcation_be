import { cache } from '../../adapters/cache'
import { makeSessions } from './application'
import { sessionsRouterV1 } from './httpV1'
import { sessionRepository } from './sequelizeRepositories'

// Raíz de composición de sesiones (salas, Juego libre, detalle para el panel y Excel)
export const sessions = makeSessions({
  sessions: sessionRepository, cache, random: () => Math.random(), now: () => new Date(),
})

export const sessionRoutesV1 = sessionsRouterV1(sessions)
// Aprendizaje la usa para resultados e intentos que llegan sin sala
export const freeSessions = sessions.freeSessions
