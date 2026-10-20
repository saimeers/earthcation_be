import { cache } from '../../adapters/cache'
import freeSession from '../../utils/freeSession.utils'
import { analyticsReadModel } from './analyticsReadModel'
import { makeLearning } from './application'
import { analyticsRouterV1, levelsRouterV1, progressRouterV1, telemetryRouterV1 } from './httpV1'
import { learningReadModel, learningRepository } from './sequelizeRepositories'

// Raíz de composición de aprendizaje: progreso, niveles, telemetría y analítica
export const learning = makeLearning({
  repo: learningRepository, reads: learningReadModel, analytics: analyticsReadModel, cache,
  // La sala "Juego libre" sigue en utils/ hasta migrar el contexto de sesiones
  freeSessions: { resolve: (userId, sessionId) => freeSession.resolveSessionId(userId, sessionId) as Promise<unknown> },
  now: () => new Date(),
})

export const progressRoutesV1 = progressRouterV1(learning)
export const levelRoutesV1 = levelsRouterV1(learning)
export const telemetryRoutesV1 = telemetryRouterV1(learning)
export const analyticsRoutesV1 = analyticsRouterV1(learning)

// Funciones puras que también usa session.service.js (detalle de sesión)
export { summarize, latestAttemptByLevel } from './attempts'
export { summarizeAttempts, summarizeRisks, round } from './summaries'
