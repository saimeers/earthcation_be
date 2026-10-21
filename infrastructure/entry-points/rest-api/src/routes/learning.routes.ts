import { Router, type RequestHandler } from 'express'
import { requireRole } from '../middlewares/auth'
import { AnalyticsController, type AnalyticsUseCases } from '../controllers/learning/AnalyticsController'
import { LevelController, type LevelUseCases } from '../controllers/learning/LevelController'
import { ProgressController, type ProgressUseCases } from '../controllers/learning/ProgressController'
import { TelemetryController, type TelemetryUseCases } from '../controllers/learning/TelemetryController'

export interface LearningRoutesDeps {
  readonly authenticate: RequestHandler
  readonly progress: ProgressUseCases
  readonly levels: LevelUseCases
  readonly telemetry: TelemetryUseCases
  readonly analytics: AnalyticsUseCases
}

const staff = (auth: RequestHandler) => [auth, requireRole('admin', 'instructor', 'developer')]

/** `/api/progress` (legacy) */
export const progressRoutesLegacy = (deps: LearningRoutesDeps): Router => {
  const c = new ProgressController(deps.progress)
  return Router()
    .post('/save', deps.authenticate, c.save)
    .get('/full', deps.authenticate, c.full)
    .get('/me/:id', deps.authenticate, c.mine)
    .get('/level/:levelId', deps.authenticate, c.levelProgress)
    .get('/user/:userId/history', ...staff(deps.authenticate), c.history)
}

/** `/api/levels` (legacy) */
export const levelRoutesLegacy = (deps: LearningRoutesDeps): Router => {
  const c = new LevelController(deps.levels)
  return Router()
    .get('/', deps.authenticate, c.list)
    .get('/:id', deps.authenticate, c.get)
}

// El juego registra sus propios intentos y eventos
const gameRoutes = (router: Router, auth: RequestHandler, c: TelemetryController): void => {
  router.post('/attempts', auth, c.startAttempt)
  router.patch('/attempts/:id', auth, c.endAttempt)
  router.post('/events', auth, c.saveEvents)
  router.get('/me/attempts', auth, c.myAttempts)
}

// El panel consulta la telemetría de cualquier jugador o sala
const panelRoutes = (router: Router, auth: RequestHandler, c: TelemetryController): void => {
  router.get('/overview', ...staff(auth), c.overview)
  router.get('/users/:userId/attempts', ...staff(auth), c.userAttempts)
  router.get('/users/:userId/summary', ...staff(auth), c.userSummary)
  router.get('/attempts/:id', ...staff(auth), c.attemptDetail)
}

/** `/api/telemetry` (legacy) */
export const telemetryRoutesLegacy = (deps: LearningRoutesDeps): Router => {
  const c = new TelemetryController(deps.telemetry)
  const router = Router()
  gameRoutes(router, deps.authenticate, c)
  panelRoutes(router, deps.authenticate, c)
  return router
}

const readers = (auth: RequestHandler) => [auth, requireRole('instructor', 'admin', 'developer')]

/** `/api/analytics` (legacy) */
export const analyticsRoutesLegacy = (deps: LearningRoutesDeps): Router => {
  const c = new AnalyticsController(deps.analytics)
  return Router()
    .get('/overview', deps.authenticate, requireRole('admin', 'developer'), c.overview)
    .get('/organization/:orgId', ...readers(deps.authenticate), c.byOrganization)
    .get('/location', ...readers(deps.authenticate), c.byLocation)
    .get('/map', ...readers(deps.authenticate), c.minesMap)
}
