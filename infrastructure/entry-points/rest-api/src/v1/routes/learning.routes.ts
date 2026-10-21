import { z } from 'zod'
import { listQuery, paginate, sortBy } from '../http/pagination'
import { created, ok, page } from '../http/reply'
import { route, userOf, type Route } from '../http/route'
import type { AnalyticsUseCases } from '../../controllers/learning/AnalyticsController'
import type { LevelUseCases } from '../../controllers/learning/LevelController'
import type { ProgressUseCases } from '../../controllers/learning/ProgressController'
import type { TelemetryUseCases } from '../../controllers/learning/TelemetryController'
import { camelize } from '../dto/camelize'
import { snakeBody } from '../dto/snake'
import {
  analyticsDto, attemptDetailDto, attemptDto, endAttemptBody, eventsBody, levelDto, levelProgressDto, riskResultBody, riskResultDto,
  savedEventsDto, startAttemptBody, summaryDto,
} from '../dto/learning'

// Lo que registra el juego (intentos, eventos, resultados por riesgo) lo hace cualquier cuenta con sesión sobre sí
// misma; lo que consulta el panel sobre otros jugadores es del personal; las analíticas globales, de admin y desarrollador
const STAFF = ['admin', 'instructor', 'developer'] as const
const GLOBAL = ['admin', 'developer'] as const

type Row = Record<string, unknown>

const userParams = z.object({ id: z.uuid().describe('Id (UUID) del jugador') })
const attemptParams = z.object({ id: z.uuid().describe('Id (UUID) del intento') })
const levelParams = z.object({ id: z.string().regex(/^\d+$/).describe('Id numérico del nivel') })
const organizationParams = z.object({ id: z.uuid().describe('Id (UUID) de la organización') })
const resultsQuery = listQuery.extend({ sessionId: z.uuid().optional().describe('Solo los resultados de esta sala') })
const attemptsQuery = listQuery.extend({
  sessionId: z.uuid().optional().describe('Solo los intentos de esta sala'),
  levelKey: z.string().optional().describe('Solo los intentos de este nivel, p. ej. level1'),
})
const sessionQuery = z.object({ sessionId: z.uuid().optional().describe('Limita el resumen a una sala') })
const placeQuery = z.object({
  department: z.string().optional().describe('Departamento (coincidencia parcial)'),
  municipality: z.string().optional().describe('Municipio (coincidencia parcial)'),
})

const RESULT_SORT = ['recordedAt', 'riskId', 'reactionTimeMs', 'mistakesCount'] as const
const ATTEMPT_SORT = ['startedAt', 'attemptNumber', 'durationMs', 'outcome'] as const

const rowsPage = (rows: readonly unknown[], q: { sort?: string, page: number, limit: number }, allowed: readonly string[]) => {
  const items = rows.map(camelize) as Row[]
  const { items: slice, meta } = paginate(q.sort ? sortBy(items, q.sort, allowed) : items, q)
  return page(slice, meta)
}

const progressRoutes = (uc: ProgressUseCases): Route[] => [
  route({
    method: 'post', path: '/risk-results', tag: 'Progreso', summary: 'Registra el resultado del jugador frente a un riesgo', roles: [],
    body: riskResultBody,
    response: { status: 201, description: 'El resultado guardado', schema: riskResultDto },
    handler: async ({ body, user }) => created('/api/v1/risk-results/me', camelize(await uc.save.execute({ userId: userOf({ user }).id, body: snakeBody(body) }))),
  }),
  route({
    method: 'get', path: '/risk-results/me', tag: 'Progreso', summary: 'Resultados por riesgo del propio jugador', roles: [],
    query: resultsQuery,
    response: { status: 200, description: 'Una página de resultados, los más recientes primero', schema: z.array(riskResultDto), paginated: true },
    handler: async ({ query, user }) => rowsPage(await uc.list.execute({ userId: userOf({ user }).id, sessionId: query.sessionId }), query, RESULT_SORT),
  }),
  route({
    method: 'get', path: '/users/:id/risk-results', tag: 'Progreso', summary: 'Resultados por riesgo de un jugador', roles: STAFF,
    params: userParams, query: resultsQuery,
    response: { status: 200, description: 'Una página de resultados, los más recientes primero', schema: z.array(riskResultDto), paginated: true },
    handler: async ({ params, query }) => rowsPage(await uc.list.execute({ userId: params.id, sessionId: query.sessionId }), query, RESULT_SORT),
  }),
  route({
    method: 'get', path: '/levels/:id/progress/me', tag: 'Progreso', summary: 'Avance del jugador en un nivel', roles: [],
    params: levelParams,
    response: { status: 200, description: 'Riesgos mitigados y pendientes del nivel', schema: levelProgressDto },
    handler: async ({ params, user }) => ok(camelize(await uc.levelProgress.execute({ userId: userOf({ user }).id, levelId: params.id }))),
  }),
]

const levelRoutes = (uc: LevelUseCases): Route[] => [
  route({
    method: 'get', path: '/levels', tag: 'Niveles', summary: 'Lista los niveles del juego', roles: [],
    query: listQuery,
    response: { status: 200, description: 'Una página de niveles', schema: z.array(levelDto), paginated: true },
    handler: async ({ query }) => rowsPage(await uc.list.execute(), query, ['id', 'name']),
  }),
  route({
    method: 'get', path: '/levels/:id', tag: 'Niveles', summary: 'Consulta un nivel con sus riesgos', roles: [],
    params: levelParams,
    response: { status: 200, description: 'El nivel', schema: levelDto },
    handler: async ({ params }) => ok(camelize(await uc.get.execute(params.id))),
  }),
]

const attemptRoutes = (uc: TelemetryUseCases): Route[] => [
  route({
    method: 'post', path: '/attempts', tag: 'Telemetría', summary: 'Abre un intento de nivel', roles: [],
    body: startAttemptBody,
    response: { status: 201, description: 'El intento abierto (cabecera Location)', schema: attemptDto },
    handler: async ({ body, user }) => {
      const attempt = camelize(await uc.startAttempt.execute({ userId: userOf({ user }).id, body: snakeBody(body) })) as Row
      return created(`/api/v1/attempts/${String(attempt.id)}`, attempt)
    },
  }),
  route({
    method: 'patch', path: '/attempts/:id', tag: 'Telemetría', summary: 'Actualiza o cierra un intento', roles: [],
    params: attemptParams, body: endAttemptBody,
    response: { status: 200, description: 'El intento actualizado', schema: attemptDto },
    handler: async ({ params, body, user }) =>
      ok(camelize(await uc.endAttempt.execute({ userId: userOf({ user }).id, attemptId: params.id, body: snakeBody(body) }))),
  }),
  route({
    method: 'post', path: '/attempts/:id/events', tag: 'Telemetría', summary: 'Guarda un lote de eventos del intento', roles: [],
    params: attemptParams, body: eventsBody,
    response: { status: 201, description: 'Cuántos eventos se guardaron', schema: savedEventsDto },
    handler: async ({ params, body, user }) => {
      const saved = await uc.saveEvents.execute({ userId: userOf({ user }).id, body: snakeBody({ attemptId: params.id, events: body.events }) })
      return created(`/api/v1/attempts/${params.id}`, { saved })
    },
  }),
  route({
    method: 'get', path: '/attempts/me', tag: 'Telemetría', summary: 'Intentos del propio jugador', roles: [],
    query: attemptsQuery,
    response: { status: 200, description: 'Una página de intentos', schema: z.array(attemptDto), paginated: true },
    handler: async ({ query, user }) =>
      rowsPage(await uc.listAttempts.execute({ userId: userOf({ user }).id, sessionId: query.sessionId, levelKey: query.levelKey }), query, ATTEMPT_SORT),
  }),
  route({
    method: 'get', path: '/attempts/:id', tag: 'Telemetría', summary: 'Detalle de un intento con sus riesgos y eventos', roles: STAFF,
    params: attemptParams,
    response: { status: 200, description: 'El intento', schema: attemptDetailDto },
    handler: async ({ params }) => ok(camelize(await uc.attemptDetail.execute(params.id))),
  }),
  route({
    method: 'get', path: '/users/:id/attempts', tag: 'Telemetría', summary: 'Intentos de un jugador', roles: STAFF,
    params: userParams, query: attemptsQuery,
    response: { status: 200, description: 'Una página de intentos', schema: z.array(attemptDto), paginated: true },
    handler: async ({ params, query }) =>
      rowsPage(await uc.listAttempts.execute({ userId: params.id, sessionId: query.sessionId, levelKey: query.levelKey }), query, ATTEMPT_SORT),
  }),
  route({
    method: 'get', path: '/users/:id/telemetry-summary', tag: 'Telemetría', summary: 'Resumen de telemetría de un jugador', roles: STAFF,
    params: userParams, query: sessionQuery,
    response: { status: 200, description: 'El resumen', schema: summaryDto },
    handler: async ({ params, query }) => ok(camelize(await uc.userSummary.execute({ userId: params.id, sessionId: query.sessionId }))),
  }),
  route({
    method: 'get', path: '/telemetry/overview', tag: 'Telemetría', summary: 'Resumen general de telemetría', roles: STAFF,
    query: sessionQuery,
    response: { status: 200, description: 'El resumen, de todo el juego o de una sala', schema: summaryDto },
    handler: async ({ query }) => ok(camelize(await uc.overview.execute({ sessionId: query.sessionId }))),
  }),
]

const analyticsRoutes = (uc: AnalyticsUseCases): Route[] => [
  route({
    method: 'get', path: '/analytics/overview', tag: 'Analíticas', summary: 'Indicadores generales', roles: GLOBAL,
    response: { status: 200, description: 'Indicadores y desgloses de todo el juego', schema: analyticsDto },
    handler: async () => ok(camelize(await uc.overview.execute())),
  }),
  route({
    method: 'get', path: '/analytics/organizations/:id', tag: 'Analíticas', summary: 'Indicadores de una organización', roles: STAFF,
    params: organizationParams,
    response: { status: 200, description: 'Indicadores de la organización', schema: analyticsDto },
    handler: async ({ params }) => ok(camelize(await uc.byOrganization.execute(params.id))),
  }),
  route({
    method: 'get', path: '/analytics/locations', tag: 'Analíticas', summary: 'Indicadores por localidad', roles: STAFF,
    query: placeQuery,
    response: { status: 200, description: 'Indicadores de las localidades que cumplen el filtro', schema: analyticsDto },
    handler: async ({ query }) => ok(camelize(await uc.byLocation.execute(query))),
  }),
  route({
    method: 'get', path: '/analytics/mines-map', tag: 'Analíticas', summary: 'Datos del mapa de minas', roles: STAFF,
    response: { status: 200, description: 'Organizaciones y localidades con sus indicadores para el mapa', schema: analyticsDto },
    handler: async () => ok(camelize(await uc.minesMap.execute())),
  }),
]

export interface LearningV1Deps {
  readonly progress: ProgressUseCases
  readonly levels: LevelUseCases
  readonly telemetry: TelemetryUseCases
  readonly analytics: AnalyticsUseCases
}

/** Rutas de v1 de aprendizaje: progreso por riesgo, niveles, telemetría del juego y analíticas. */
export const learningRoutesV1 = (deps: LearningV1Deps): Route[] => [
  ...progressRoutes(deps.progress), ...levelRoutes(deps.levels), ...attemptRoutes(deps.telemetry), ...analyticsRoutes(deps.analytics),
]
