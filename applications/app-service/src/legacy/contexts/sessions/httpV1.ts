import { Router, type Request, type Response } from 'express'
import auth from '../../middleware/auth.middleware'
import requireRole from '../../middleware/role.middleware'
import { body, queryText, sendV1 } from '../../adapters/http/v1/respond'
import { keyOf } from '../../shared/collections'
import type { Joined, Sessions } from './application'
import type { Requester } from './domain'

// Rutas v1 de sesiones (/api/sessions)

const requester = (req: Request): Requester => (req as Request & { user: Requester }).user
const param = (req: Request, name: string): string => String(req.params[name])
const instructors = [auth, requireRole('instructor', 'admin')]
const readers = [auth, requireRole('instructor', 'admin', 'developer')]

const joinedV1 = (j: Joined) => (j.joined ? { session: j.session, joined: true } : { session: j.session, joined: false, message: 'Ya estás en esta sesión' })

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const exportXlsx = (s: Sessions) => async (req: Request, res: Response) => {
  const result = await s.workbook(param(req, 'id'), requester(req))
  if (!result.ok) { sendV1(res, result, () => undefined); return }
  const date = new Date().toISOString().slice(0, 10)
  res.setHeader('Content-Type', XLSX_TYPE)
  res.setHeader('Content-Disposition', `attachment; filename="sesion-${keyOf(result.value.code)}-${date}.xlsx"`)
  await result.value.workbook.xlsx.write(res)
  res.end()
}

const create = (s: Sessions) => async (req: Request, res: Response) => {
  sendV1(res, await s.create(requester(req).id, body(req.body)), (session) => res.status(201).json({ message: 'Sesión creada', session }))
}
const join = (s: Sessions) => async (req: Request, res: Response) => { sendV1(res, await s.join(requester(req).id, body(req.body)), (j) => res.json(joinedV1(j))) }
const start = (s: Sessions) => async (req: Request, res: Response) => {
  sendV1(res, await s.start(param(req, 'id'), requester(req).id), (session) => res.json({ message: 'Sesión iniciada', session }))
}
const end = (s: Sessions) => async (req: Request, res: Response) => {
  sendV1(res, await s.end(param(req, 'id'), requester(req).id), (session) => res.json({ message: 'Sesión finalizada', session }))
}

const writeRoutes = (router: Router, s: Sessions) => {
  router.post('/', ...instructors, create(s))
  router.post('/join', auth, join(s))
  router.patch('/:id/start', ...instructors, start(s))
  router.patch('/:id/end', ...instructors, end(s))
}

const byLocation = (s: Sessions) => async (req: Request, res: Response) => {
  res.json(await s.byLocation({ department: queryText(req.query.department), municipality: queryText(req.query.municipality) }))
}

// El juego valida el código que llegó por QR y muestra el nombre de la sala (sin inscribir al jugador)
const listRoutes = (router: Router, s: Sessions) => {
  router.get('/code/:code', auth, async (req: Request, res: Response) => { sendV1(res, await s.byCode(param(req, 'code')), (x) => res.json(x)) })
  router.get('/mine', ...readers, async (req: Request, res: Response) => { res.json(await s.mine(requester(req).id)) })
  router.get('/all', auth, requireRole('admin', 'developer'), async (_req: Request, res: Response) => { res.json(await s.all()) })
  router.get('/by-location', ...readers, byLocation(s))
}

const analysis = (s: Sessions) => async (req: Request, res: Response) => {
  sendV1(res, await s.analysis(param(req, 'id'), requester(req), param(req, 'userId')), (a) => res.json(a))
}

// Detalle completo, análisis y Excel: admin todo; instructor solo sus salas y su "Juego libre"
const detailRoutes = (router: Router, s: Sessions) => {
  router.get('/:id/progress', ...readers, async (req: Request, res: Response) => {
    sendV1(res, await s.progress(param(req, 'id'), requester(req).id), (p) => res.json(p))
  })
  router.get('/:id/progress/admin', ...readers, async (req: Request, res: Response) => {
    sendV1(res, await s.detail(param(req, 'id'), requester(req)), (d) => res.json(d))
  })
  router.get('/:id/participants/:userId/analysis', ...readers, analysis(s))
  router.get('/:id/export.xlsx', ...readers, exportXlsx(s))
}

export const sessionsRouterV1 = (s: Sessions): Router => {
  const router = Router()
  writeRoutes(router, s)
  listRoutes(router, s)
  detailRoutes(router, s)
  return router
}
