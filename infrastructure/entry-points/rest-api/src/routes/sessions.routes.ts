import { Router, type RequestHandler } from 'express'
import { requireRole } from '../middlewares/auth'
import { SessionController, type SessionUseCases } from '../controllers/sessions/SessionController'

export interface SessionsRoutesDeps {
  readonly authenticate: RequestHandler
  readonly sessions: SessionUseCases
}

const instructors = (auth: RequestHandler) => [auth, requireRole('instructor', 'admin')]
const readers = (auth: RequestHandler) => [auth, requireRole('instructor', 'admin', 'developer')]

const writeRoutes = (router: Router, auth: RequestHandler, c: SessionController): void => {
  router.post('/', ...instructors(auth), c.create)
  router.post('/join', auth, c.join)
  router.patch('/:id/start', ...instructors(auth), c.start)
  router.patch('/:id/end', ...instructors(auth), c.end)
}

// El juego valida el código que llegó por QR y muestra el nombre de la sala (sin inscribir al jugador)
const listRoutes = (router: Router, auth: RequestHandler, c: SessionController): void => {
  router.get('/code/:code', auth, c.byCode)
  router.get('/mine', ...readers(auth), c.mine)
  router.get('/all', auth, requireRole('admin', 'developer'), c.all)
  router.get('/by-location', ...readers(auth), c.byLocation)
}

// Detalle completo, análisis y Excel: admin todo; instructor solo sus salas y su "Juego libre"
const detailRoutes = (router: Router, auth: RequestHandler, c: SessionController): void => {
  router.get('/:id/progress', ...readers(auth), c.progress)
  router.get('/:id/progress/admin', ...readers(auth), c.detail)
  router.get('/:id/participants/:userId/analysis', ...readers(auth), c.analysis)
  router.get('/:id/export.xlsx', ...readers(auth), c.exportReport)
}

/** `/api/sessions` (v1) */
export const sessionRoutesV1 = (deps: SessionsRoutesDeps): Router => {
  const c = new SessionController(deps.sessions)
  const router = Router()
  writeRoutes(router, deps.authenticate, c)
  listRoutes(router, deps.authenticate, c)
  detailRoutes(router, deps.authenticate, c)
  return router
}
