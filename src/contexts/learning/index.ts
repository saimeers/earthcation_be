import { cache } from '../../adapters/cache'
import { freeSessions } from '../sessions'
import { analyticsReadModel } from './analyticsReadModel'
import { makeLearning } from './application'
import { analyticsRouterV1, levelsRouterV1, progressRouterV1, telemetryRouterV1 } from './httpV1'
import { learningReadModel, learningRepository } from './sequelizeRepositories'

// Raíz de composición de aprendizaje: progreso, niveles, telemetría y analítica
export const learning = makeLearning({
  repo: learningRepository, reads: learningReadModel, analytics: analyticsReadModel, cache,
  freeSessions, // la sala "Juego libre" del contexto de sesiones
  now: () => new Date(),
})

export const progressRoutesV1 = progressRouterV1(learning)
export const levelRoutesV1 = levelsRouterV1(learning)
export const telemetryRoutesV1 = telemetryRouterV1(learning)
export const analyticsRoutesV1 = analyticsRouterV1(learning)

// Funciones puras que también usa session.service.js (detalle de sesión)
export { summarize, latestAttemptByLevel } from './attempts'
export { summarizeAttempts, summarizeRisks, round } from './summaries'
