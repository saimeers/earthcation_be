import { cache } from '../../adapters/cache'
import { makeObservability } from './application'
import { healthRouterV1, loginRecorder, publicHealthV1, visitsRouterV1 } from './httpV1'
import { healthProbes, metricsMiddleware, runtime } from './runtime'
import { visitRepository, visitStatsReadModel } from './sequelizeRepositories'

// Raíz de composición de observabilidad: visitas, inicios de sesión, salud y métricas
export const observability = makeObservability({
  visits: visitRepository, stats: visitStatsReadModel, cache, probes: healthProbes, runtime,
})

export const metrics = metricsMiddleware
export const recordLogin = loginRecorder(observability)
export const visitRoutesV1 = visitsRouterV1(observability, () => process.env.VISITS_INGEST_SECRET)
export const healthRoutesV1 = healthRouterV1(observability)
export const publicHealth = publicHealthV1(observability)
