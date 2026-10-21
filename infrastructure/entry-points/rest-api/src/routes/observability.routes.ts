import { Router, type RequestHandler } from 'express'
import { requireRole } from '../middlewares/auth'
import { requireIngestSecret } from '../middlewares/ingestSecret'
import { HealthController } from '../controllers/observability/HealthController'
import { VisitController, type VisitUseCases } from '../controllers/observability/VisitController'
import type { GetHealthUseCase } from '@earthcation/usecase'

export interface ObservabilityRoutesDeps {
  readonly authenticate: RequestHandler
  readonly visits: VisitUseCases
  readonly health: GetHealthUseCase
  /** VISITS_INGEST_SECRET (lo lee config/env.ts); sin él, la ingesta responde 401 siempre. */
  readonly ingestSecret: string | undefined
}

// Estadísticas y detalle de salud: admin y desarrollador
const staff = (auth: RequestHandler) => [auth, requireRole('admin', 'developer')]

/** /api/visits (legacy). Se monta antes del limitador global: todas las visitas llegan desde las IP del Worker. */
export const visitRoutesLegacy = (deps: ObservabilityRoutesDeps): Router => {
  const c = new VisitController(deps.visits)
  return Router()
    .post('/ingest', requireIngestSecret(deps.ingestSecret), c.ingest)
    .get('/stats', ...staff(deps.authenticate), c.stats)
}

/** GET /api/health (legacy): estado público mínimo, para monitores externos y Railway. */
export const publicHealthLegacy = (deps: ObservabilityRoutesDeps): RequestHandler => new HealthController(deps.health).status

/** /api/health (legacy): /details con BD, Redis, pool y métricas de las últimas 15 min. */
export const healthRoutesLegacy = (deps: ObservabilityRoutesDeps): Router =>
  Router().get('/details', ...staff(deps.authenticate), new HealthController(deps.health).details)
