import { Router, type Request, type Response } from 'express'
import auth from '../../middleware/auth.middleware'
import requireRole from '../../middleware/role.middleware'
import { body, queryText, sendV1 } from '../../adapters/http/v1/respond'
import type { Learning } from './application'

// Rutas v1 de aprendizaje: /api/progress, /api/levels, /api/telemetry y /api/analytics

const staff = [auth, requireRole('admin', 'instructor', 'developer')]
const userId = (req: Request): string => (req as Request & { user: { id: string } }).user.id
const param = (req: Request, name: string): string => String(req.params[name])
const sessionOf = (req: Request) => ({ sessionId: queryText(req.query.session_id) })

const saveProgress = (l: Learning) => async (req: Request, res: Response) => {
  sendV1(res, await l.saveProgress(userId(req), body(req.body)), (progress) => res.status(201).json({ message: 'Progreso guardado', progress }))
}

const fullProgress = (l: Learning) => async (req: Request, res: Response) => {
  const progress = await l.progress(userId(req), {})
  res.json({ user_id: userId(req), total_attempts: progress.length, progress })
}

export const progressRouterV1 = (l: Learning): Router => Router()
  .post('/save', auth, saveProgress(l))
  .get('/full', auth, fullProgress(l))
  .get('/me/:id', auth, async (req: Request, res: Response) => { res.json(await l.progress(userId(req), { sessionId: param(req, 'id') })) })
  .get('/level/:levelId', auth, async (req: Request, res: Response) => { res.json(await l.levelProgress(userId(req), param(req, 'levelId'))) })
  .get('/user/:userId/history', ...staff, async (req: Request, res: Response) => { res.json(await l.progress(param(req, 'userId'), sessionOf(req))) })

export const levelsRouterV1 = (l: Learning): Router => Router()
  .get('/', auth, async (_req: Request, res: Response) => { res.json(await l.levels()) })
  .get('/:id', auth, async (req: Request, res: Response) => { sendV1(res, await l.level(param(req, 'id')), (level) => res.json(level)) })

// Escritura: la usa el juego (cualquier usuario autenticado, sobre sus propios intentos)
const startAttempt = (l: Learning) => async (req: Request, res: Response) => {
  sendV1(res, await l.startAttempt(userId(req), body(req.body)), (attempt) => res.status(201).json({ message: 'Intento iniciado', attempt }))
}
const endAttempt = (l: Learning) => async (req: Request, res: Response) => {
  sendV1(res, await l.endAttempt(userId(req), param(req, 'id'), body(req.body)), (attempt) => res.json({ message: 'Intento actualizado', attempt }))
}
const saveEvents = (l: Learning) => async (req: Request, res: Response) => {
  sendV1(res, await l.saveEvents(userId(req), body(req.body)), (saved) => res.status(201).json({ message: 'Eventos guardados', saved }))
}

const gameRoutes = (router: Router, l: Learning) => {
  router.post('/attempts', auth, startAttempt(l))
  router.patch('/attempts/:id', auth, endAttempt(l))
  router.post('/events', auth, saveEvents(l))
}

const attemptFilter = (req: Request) => ({ levelKey: queryText(req.query.level_key), ...sessionOf(req) })

// Lectura: panel web (y el juego sus propios intentos)
const userAttempts = (l: Learning) => async (req: Request, res: Response) => { res.json(await l.attempts(param(req, 'userId'), attemptFilter(req))) }
const userSummary = (l: Learning) => async (req: Request, res: Response) => { res.json(await l.userSummary(param(req, 'userId'), sessionOf(req))) }
const attemptDetail = (l: Learning) => async (req: Request, res: Response) => {
  sendV1(res, await l.attemptDetail(param(req, 'id')), (detail) => res.json(detail))
}

const panelRoutes = (router: Router, l: Learning) => {
  router.get('/me/attempts', auth, async (req: Request, res: Response) => { res.json(await l.attempts(userId(req), attemptFilter(req))) })
  router.get('/overview', ...staff, async (req: Request, res: Response) => { res.json(await l.telemetryOverview(sessionOf(req))) })
  router.get('/users/:userId/attempts', ...staff, userAttempts(l))
  router.get('/users/:userId/summary', ...staff, userSummary(l))
  router.get('/attempts/:id', ...staff, attemptDetail(l))
}

export const telemetryRouterV1 = (l: Learning): Router => {
  const router = Router()
  gameRoutes(router, l)
  panelRoutes(router, l)
  return router
}

const readers = [auth, requireRole('instructor', 'admin', 'developer')]

export const analyticsRouterV1 = (l: Learning): Router => Router()
  .get('/overview', auth, requireRole('admin', 'developer'), async (_req: Request, res: Response) => { res.json(await l.analytics.overview()) })
  .get('/organization/:orgId', ...readers, async (req: Request, res: Response) => { res.json(await l.analytics.byOrganization(param(req, 'orgId'))) })
  .get('/location', ...readers, async (req: Request, res: Response) => {
    res.json(await l.analytics.byLocation({ department: queryText(req.query.department), municipality: queryText(req.query.municipality) }))
  })
  .get('/map', ...readers, async (_req: Request, res: Response) => { res.json(await l.analytics.minesMap()) })
