import type { GetHealthUseCase } from '@earthcation/usecase'
import { requireIngestSecret } from '../../middlewares/ingestSecret'
import type { VisitUseCases } from '../../controllers/observability/VisitController'
import { isoDates } from '../dto/camelize'
import { healthDetailsDto, publicHealthDto, visitBody, visitsQuery, visitStatsDto } from '../dto/observability'
import { snakeBody } from '../dto/snake'
import { ok, noContent } from '../http/reply'
import { route, type Route } from '../http/route'

// Estadísticas y detalle de salud: admin y desarrollador
const STAFF = ['admin', 'developer'] as const

export interface ObservabilityV1Deps {
  readonly visits: VisitUseCases
  readonly health: GetHealthUseCase
  /** VISITS_INGEST_SECRET; sin él, la ingesta responde 401 siempre. */
  readonly ingestSecret: string | undefined
}

/** Rutas de v1 de visitas y salud del servicio. */
export const observabilityRoutesV1 = ({ visits, health, ingestSecret }: ObservabilityV1Deps): Route[] => [
  route({
    method: 'post', path: '/visits', tag: 'Observabilidad', summary: 'Registra una apertura del juego (la reporta el Worker)',
    middlewares: [requireIngestSecret(ingestSecret)], body: visitBody,
    response: { status: 204, description: 'Visita registrada. Se protege con la cabecera x-ingest-secret, sin token' },
    handler: async ({ body }) => {
      await visits.ingest.execute({ fields: snakeBody(body) })
      return noContent()
    },
  }),
  route({
    method: 'get', path: '/visits/stats', tag: 'Observabilidad', summary: 'Estadísticas de visitas al juego', roles: STAFF,
    query: visitsQuery,
    response: { status: 200, description: 'Totales y desgloses de la ventana pedida', schema: visitStatsDto },
    handler: async ({ query }) => ok(isoDates(await visits.stats.execute({ days: query.days }))),
  }),
  route({
    method: 'get', path: '/health', tag: 'Observabilidad', summary: 'Estado público mínimo del servicio',
    response: { status: 200, description: 'ok; si la base de datos no responde, 503 con status degraded', schema: publicHealthDto },
    handler: async () => {
      const h = await health.execute({ withMetrics: false })
      return { status: h.status === 'ok' ? 200 : 503, data: { status: h.status, version: h.version, uptimeS: h.uptimeS } }
    },
  }),
  route({
    method: 'get', path: '/health/details', tag: 'Observabilidad', summary: 'Salud detallada: base de datos, Redis, memoria y métricas', roles: STAFF,
    response: { status: 200, description: 'El detalle completo', schema: healthDetailsDto },
    handler: async () => ok(isoDates(await health.execute({ withMetrics: true }))),
  }),
]

