import express, { Router, type RequestHandler } from 'express'
import type { GetPlayFileUseCase } from '@earthcation/usecase'
import { requireRole } from '../middlewares/auth'
import { DeploymentController, type DeploymentUseCases } from '../controllers/deployment/DeploymentController'
import { PlayLocalController } from '../controllers/deployment/PlayLocalController'

export interface DeploymentRoutesDeps {
  readonly authenticate: RequestHandler
  readonly deployment: DeploymentUseCases
  /** Límite del cuerpo del PUT del ZIP (DEPLOY_MAX_MB). */
  readonly maxUploadMb: number
}

// Solo sin S3 (desarrollo) llega el ZIP a la API; con S3 el navegador lo sube a la URL prefirmada
const rawZip = (maxMb: number) => express.raw({ type: ['application/zip', 'application/octet-stream'], limit: `${maxMb}mb` })

/** /api/deploy (v1): solo desarrollador y admin. */
export const deployRoutesV1 = (deps: DeploymentRoutesDeps): Router => {
  const c = new DeploymentController(deps.deployment)
  return Router()
    .use(deps.authenticate, requireRole('admin', 'developer'))
    .get('/status', c.status).get('/versions', c.list).get('/versions/:id/preview', c.preview)
    .put('/versions/:id/upload', rawZip(deps.maxUploadMb), c.upload)
    .post('/versions', c.create).post('/versions/:id/complete', c.complete)
    .post('/versions/:id/activate', c.activate)
    .delete('/versions/:id', c.remove)
}

/** /play-local (solo desarrollo, sin R2): /play-local/ → versión activa, /play-local/v/<id>/ → vista previa. */
export const playLocalRoutes = (getPlayFile: GetPlayFileUseCase): Router =>
  Router().get(/^\/(.*)$/, new PlayLocalController(getPlayFile).serve)
