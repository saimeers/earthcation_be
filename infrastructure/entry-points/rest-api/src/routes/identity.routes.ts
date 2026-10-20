import { Router, type RequestHandler } from 'express'
import multer from 'multer'
import { requireRole } from '../middlewares/auth'
import { AuthController, type AuthUseCases } from '../controllers/identity/AuthController'
import { BulkImportController, type BulkImportUseCases } from '../controllers/identity/BulkImportController'
import { UserController, type UserUseCases } from '../controllers/identity/UserController'

export interface IdentityRoutesDeps {
  readonly authenticate: RequestHandler
  readonly auth: AuthUseCases
  readonly users: UserUseCases
  readonly bulkImport: BulkImportUseCases
}

const readers = (auth: RequestHandler) => [auth, requireRole('admin', 'instructor', 'developer')]
const admins = (auth: RequestHandler) => [auth, requireRole('admin')]
const importers = (auth: RequestHandler) => [auth, requireRole('admin', 'instructor')]

// En memoria: el archivo solo se lee, no se guarda en disco
const MAX_FILE_BYTES = 10 * 1024 * 1024
const upload: RequestHandler = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES } }).single('file')

/** /api/auth (v1): login, olvidé mi contraseña y restablecer. Sin token. */
export const authRoutesV1 = (deps: IdentityRoutesDeps): Router => {
  const c = new AuthController(deps.auth)
  return Router().post('/login', c.login).post('/forgot-password', c.forgotPassword).post('/reset-password', c.resetPassword)
}

/** /api/users (v1). Editar: cualquiera con sesión sobre sí mismo; el admin sobre cualquiera. */
export const userRoutesV1 = (deps: IdentityRoutesDeps): Router => {
  const [c, read, admin] = [new UserController(deps.users), readers(deps.authenticate), admins(deps.authenticate)]
  return Router()
    .get('/', ...read, c.list).get('/:id', ...read, c.get).get('/:id/sessions', ...read, c.sessions)
    .post('/', ...admin, c.create)
    .put('/:id', deps.authenticate, c.update)
    .patch('/:id/disable', ...admin, c.disable)
    .patch('/:id/enable', ...admin, c.enable)
}

/** /api/users/bulk-import (v1): admin e instructor. */
export const bulkImportRoutesV1 = (deps: IdentityRoutesDeps): Router => {
  const c = new BulkImportController(deps.bulkImport)
  return Router()
    .post('/parse', ...importers(deps.authenticate), upload, c.parse)
    .post('/confirm', ...importers(deps.authenticate), c.confirm)
}
