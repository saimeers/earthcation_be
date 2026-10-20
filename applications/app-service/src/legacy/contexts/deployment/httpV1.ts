import express, { Router, type Request, type Response } from 'express'
import auth from '../../middleware/auth.middleware'
import requireRole from '../../middleware/role.middleware'
import { body, sendV1 } from '../../adapters/http/v1/respond'
import { validation } from '../../shared/errors'
import { err } from '../../shared/result'
import type { Created, Deployment, DeployStatus, Preview } from './application'
import type { DeployConfig } from './ports'

// Rutas v1 del despliegue del juego (/api/deploy), solo desarrollador y admin

const statusV1 = (s: DeployStatus) => ({
  play_url: s.playUrl, storage: s.storage, max_mb: s.maxMb,
  active: s.active && { id: s.active.id, label: s.active.label, activated_at: s.active.activatedAt, product_version: s.active.productVersion },
})
const previewV1 = (p: Preview) => ({ url: p.url, expires_in: p.expiresIn })
const createdV1 = (c: Created) => ({ version: c.version, upload: c.upload })

const id = (req: Request): string => String(req.params.id)
const userId = (req: Request): string => (req as Request & { user: { id: string } }).user.id
const origin = (req: Request): string => `${req.protocol}://${req.get('host') ?? ''}`

const noZip = () => err(validation('ZIP_BODY_REQUIRED', 'Envía el ZIP en el cuerpo (application/zip)'))

const readRoutes = (router: Router, d: Deployment) => {
  router.get('/status', async (_req: Request, res: Response) => { res.json(statusV1(await d.status())) })
  router.get('/versions', async (_req: Request, res: Response) => { res.json(await d.list()) })
  router.get('/versions/:id/preview', async (req: Request, res: Response) => {
    sendV1(res, await d.preview(id(req), origin(req)), (p) => res.json(previewV1(p)))
  })
}

// Solo sin S3 (desarrollo): el ZIP llega a la API; con S3 el navegador lo sube a la URL prefirmada
const uploadRoute = (router: Router, d: Deployment, config: DeployConfig) => {
  const raw = express.raw({ type: ['application/zip', 'application/octet-stream'], limit: `${config.maxMb()}mb` })
  router.put('/versions/:id/upload', raw, async (req: Request, res: Response) => {
    const zip: unknown = req.body
    const result = Buffer.isBuffer(zip) && zip.length > 0 ? await d.receiveZip(id(req), zip) : noZip()
    sendV1(res, result, () => res.json({ message: 'ZIP recibido' }))
  })
}

const writeRoutes = (router: Router, d: Deployment) => {
  router.post('/versions', async (req: Request, res: Response) => {
    sendV1(res, await d.create(userId(req), body(req.body)), (c) => res.status(201).json(createdV1(c)))
  })
  router.post('/versions/:id/complete', async (req: Request, res: Response) => { sendV1(res, await d.complete(id(req)), (v) => res.json(v)) })
}

const lifecycleRoutes = (router: Router, d: Deployment) => {
  router.post('/versions/:id/activate', async (req: Request, res: Response) => {
    sendV1(res, await d.activate(id(req)), (v) => res.json({ message: `Versión ${String(v.label)} activa`, version: v }))
  })
  router.delete('/versions/:id', async (req: Request, res: Response) => {
    sendV1(res, await d.remove(id(req)), () => res.json({ message: 'Versión eliminada' }))
  })
}

export const deployRouterV1 = (d: Deployment, config: DeployConfig): Router => {
  const router = Router()
  router.use(auth, requireRole('admin', 'developer'))
  readRoutes(router, d)
  uploadRoute(router, d, config)
  writeRoutes(router, d)
  lifecycleRoutes(router, d)
  return router
}
