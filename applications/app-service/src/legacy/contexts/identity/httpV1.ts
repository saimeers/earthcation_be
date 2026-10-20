import { Router, type Request, type RequestHandler, type Response } from 'express'
import multer from 'multer'
import auth from '../../middleware/auth.middleware'
import requireRole from '../../middleware/role.middleware'
import { body, queryText, sendV1 } from '../../adapters/http/v1/respond'
import type { PreviewRow } from './anm'
import type { Creation, IdentityUseCases, Session } from './application'
import type { Created, ImportReport } from './bulkImport'
import type { Requester } from './domain'
import type { Account } from './ports'

// Rutas v1 de identidad: /api/auth, /api/users y /api/users/bulk-import, con las respuestas de siempre

type LoginHook = (req: Request, user: { readonly id: string; readonly role: string }) => void

const accountV1 = (a: Account) => ({
  id: a.id, username: a.username, first_name: a.firstName, last_name: a.lastName, role: a.role, cedula: a.cedula, email: a.email,
  vark_completed: a.dominantStyle !== null, dominant_style: a.dominantStyle, organization: a.organization, location: a.location,
})
const sessionV1 = (s: Session) => ({ message: 'Login exitoso', token: s.token, user: accountV1(s.account) })

const RESET_SENT = 'Si el correo está registrado recibirás un enlace en breve.'

// Registro público deshabilitado: el alta es exclusiva del panel (creación manual o carga masiva)
const loginHandler = (id: IdentityUseCases, onLogin: LoginHook) => async (req: Request, res: Response) => {
  const b = body(req.body)
  sendV1(res, await id.login(b.cedula, b.password), (s) => { onLogin(req, s.account); res.json(sessionV1(s)) })
}

const passwordRoutes = (router: Router, id: IdentityUseCases) => {
  router.post('/forgot-password', async (req: Request, res: Response) => {
    sendV1(res, await id.forgotPassword(body(req.body).email), () => res.json({ message: RESET_SENT }))
  })
  router.post('/reset-password', async (req: Request, res: Response) => {
    const b = body(req.body)
    sendV1(res, await id.resetPassword(b.token, b.new_password), () => res.json({ message: 'Contraseña actualizada correctamente' }))
  })
}

export const authRouterV1 = (id: IdentityUseCases, onLogin: LoginHook): Router => {
  const router = Router().post('/login', loginHandler(id, onLogin))
  passwordRoutes(router, id)
  return router
}

const CREATED_MESSAGE: Readonly<Record<Creation['notified'], string>> = {
  player: 'Usuario creado', sent: 'Usuario creado y correo enviado', failed: 'Usuario creado, pero no se pudo enviar el correo',
}
const creationV1 = (c: Creation) => ({ message: CREATED_MESSAGE[c.notified], user_id: c.userId, email_sent: c.emailSent })

const readers = [auth, requireRole('admin', 'instructor', 'developer')]
const admin = [auth, requireRole('admin')]
const requester = (req: Request): Requester => (req as Request & { user: Requester }).user
const param = (req: Request): string => String(req.params.id)

const readRoutes = (router: Router, id: IdentityUseCases) => {
  router.get('/', ...readers, async (req: Request, res: Response) => {
    const q = req.query
    res.json(await id.list({ role: queryText(q.role), organizationId: queryText(q.organization_id), locationId: queryText(q.location_id) }))
  })
  router.get('/:id', ...readers, async (req: Request, res: Response) => { sendV1(res, await id.get(param(req)), (u) => res.json(u)) })
  router.get('/:id/sessions', ...readers, async (req: Request, res: Response) => { res.json(await id.sessions(param(req))) })
}

type Activation = { readonly path: string; readonly run: IdentityUseCases['enable']; readonly message: string }

const activation = (router: Router, a: Activation) => {
  router.patch(a.path, ...admin, async (req: Request, res: Response) => { sendV1(res, await a.run(param(req)), () => res.json({ message: a.message })) })
}

const writeRoutes = (router: Router, id: IdentityUseCases) => {
  router.post('/', ...admin, async (req: Request, res: Response) => {
    sendV1(res, await id.create(body(req.body)), (c) => res.status(201).json(creationV1(c)))
  })
  // Cualquiera con sesión, sobre sí mismo; el admin sobre cualquiera
  router.put('/:id', auth, async (req: Request, res: Response) => {
    sendV1(res, await id.update(param(req), requester(req), body(req.body)), (user) => res.json({ message: 'Usuario actualizado', user }))
  })
  activation(router, { path: '/:id/disable', run: id.disable, message: 'Usuario deshabilitado correctamente' })
  activation(router, { path: '/:id/enable', run: id.enable, message: 'Usuario habilitado correctamente' })
}

export const usersRouterV1 = (id: IdentityUseCases): Router => {
  const router = Router()
  readRoutes(router, id)
  writeRoutes(router, id)
  return router
}

const previewV1 = (r: PreviewRow) => ({
  cedula: r.cedula, first_name: r.firstName, last_name: r.lastName, age: r.age, email: r.email, organization_name: r.organizationName,
  location_municipality: r.locationMunicipality, location_department: r.locationDepartment, status: r.status, message: r.message,
})
const createdV1 = (c: Created) => ({
  cedula: c.cedula, user_id: c.userId, organization_created: c.organizationCreated,
  location_created: c.locationCreated, location_no_match: c.locationNoMatch,
})
const reportV1 = (r: ImportReport) => ({ created: r.created.map(createdV1), skipped: r.skipped, errors: r.errors })

// En memoria: el archivo solo se lee, no se guarda en disco
const upload: RequestHandler = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }).single('file')
const importers = [auth, requireRole('admin', 'instructor')]

export const bulkImportRouterV1 = (id: IdentityUseCases): Router => {
  const router = Router()
  router.post('/parse', ...importers, upload, async (req: Request, res: Response) => {
    sendV1(res, await id.parseImport(req.file?.buffer), (rows) => res.json({ rows: rows.map(previewV1) }))
  })
  router.post('/confirm', ...importers, async (req: Request, res: Response) => {
    sendV1(res, await id.confirmImport(body(req.body).rows), (r) => res.status(201).json(reportV1(r)))
  })
  return router
}
