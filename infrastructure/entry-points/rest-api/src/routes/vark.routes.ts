import { Router, type RequestHandler } from 'express'
import { requireRole } from '../middlewares/auth'
import { VarkController, type VarkUseCases } from '../controllers/vark/VarkController'

export interface VarkRoutesDeps {
  readonly authenticate: RequestHandler
  readonly vark: VarkUseCases
}

// El jugador envía y consulta su test; los listados del panel son para el personal (lectura)
const staff = (auth: RequestHandler) => [auth, requireRole('instructor', 'admin', 'developer')]

/** /api/vark (v1) */
export const varkRoutesV1 = (deps: VarkRoutesDeps): Router => {
  const c = new VarkController(deps.vark)
  return Router()
    .post('/submit', deps.authenticate, c.submit)
    .get('/me', deps.authenticate, c.mine)
    .get('/all', ...staff(deps.authenticate), c.list)
    .get('/by-style/:style', ...staff(deps.authenticate), c.byStyle)
    .get('/by-location', ...staff(deps.authenticate), c.byPlace)
}
