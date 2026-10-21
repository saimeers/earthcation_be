import express from 'express'
import { z } from 'zod'
import { listQuery, paginate, sortBy } from '../http/pagination'
import { created, noContent, ok, page } from '../http/reply'
import { route, userOf, type Route } from '../http/route'
import type { DeploymentUseCases } from '../../controllers/deployment/DeploymentController'
import {
  createdVersionDto, createVersionBody, deployStatusDto, editVersionBody, listedVersionDto, previewDto, toCreatedVersionDto, toDeployStatusDto,
  toListedVersionDto, toPreviewDto, toVersionDto, versionDto,
} from '../dto/deployment'

// Despliegue del juego: solo desarrollador y admin
const DEPLOYERS = ['admin', 'developer'] as const

const SORT = ['createdAt', 'label', 'status', 'activatedAt'] as const

const idParams = z.object({ id: z.uuid().describe('Id (UUID) de la versión') })

// Solo sin S3 (desarrollo) llega el ZIP a la API; con S3 el navegador lo sube a la URL prefirmada
const rawZip = (maxMb: number) => express.raw({ type: ['application/zip', 'application/octet-stream'], limit: `${maxMb}mb` })

// express.raw deja un Buffer si llegó un ZIP; si no, el cuerpo es otra cosa (o nada)
const zipOf = (body: unknown): Uint8Array | null => (Buffer.isBuffer(body) ? body : null)

export interface DeploymentV1Deps {
  readonly deployment: DeploymentUseCases
  /** Límite del cuerpo del PUT del ZIP (DEPLOY_MAX_MB). */
  readonly maxUploadMb: number
}

/** Rutas de v1 del despliegue de versiones del juego WebGL. */
export const deploymentRoutesV1 = ({ deployment: uc, maxUploadMb }: DeploymentV1Deps): Route[] => [
  route({
    method: 'get', path: '/game-versions/status', tag: 'Despliegue', summary: 'Estado del despliegue: versión activa, almacenamiento y tope de tamaño', roles: DEPLOYERS,
    response: { status: 200, description: 'Estado actual', schema: deployStatusDto },
    handler: async () => ok(toDeployStatusDto(await uc.status.execute())),
  }),
  route({
    method: 'get', path: '/game-versions', tag: 'Despliegue', summary: 'Lista las versiones del juego', roles: DEPLOYERS,
    query: listQuery,
    response: { status: 200, description: 'Una página de versiones, las más recientes primero', schema: z.array(listedVersionDto), paginated: true },
    handler: async ({ query }) => {
      const versions = (await uc.list.execute()).map(toListedVersionDto)
      const { items, meta } = paginate(query.sort ? sortBy(versions, query.sort, SORT) : versions, query)
      return page(items, meta)
    },
  }),
  route({
    method: 'post', path: '/game-versions', tag: 'Despliegue', summary: 'Crea una versión y devuelve adónde subir el ZIP', roles: DEPLOYERS,
    body: createVersionBody,
    response: { status: 201, description: 'La versión en estado uploading y el destino de la subida (cabecera Location)', schema: createdVersionDto },
    handler: async ({ body, user }) => {
      const c = await uc.create.execute({ label: body.label, notes: body.notes, sizeBytes: body.sizeBytes, uploadedBy: userOf({ user }).id })
      return created(`/api/v1/game-versions/${c.version.id}`, toCreatedVersionDto(c))
    },
  }),
  route({
    method: 'put', path: '/game-versions/:id/upload', tag: 'Despliegue', summary: 'Sube el ZIP a la API (solo sin S3, en desarrollo)', roles: DEPLOYERS,
    params: idParams, middlewares: [rawZip(maxUploadMb)], upload: { contentType: 'application/zip', description: 'El build WebGL comprimido' },
    response: { status: 204, description: 'ZIP recibido' },
    handler: async ({ params, req }) => {
      await uc.receiveZip.execute({ id: params.id, zip: zipOf(req.body) })
      return noContent()
    },
  }),
  route({
    method: 'post', path: '/game-versions/:id/completion', tag: 'Despliegue', summary: 'Marca la subida como completa y encola la publicación', roles: DEPLOYERS,
    params: idParams,
    response: { status: 200, description: 'La versión en estado processing', schema: versionDto },
    handler: async ({ params }) => ok(toVersionDto(await uc.complete.execute(params.id))),
  }),
  route({
    method: 'post', path: '/game-versions/:id/activation', tag: 'Despliegue', summary: 'Activa una versión (la que sirve el Worker); activar otra es el rollback', roles: DEPLOYERS,
    params: idParams,
    response: { status: 200, description: 'La versión activa', schema: versionDto },
    handler: async ({ params }) => ok(toVersionDto(await uc.activate.execute(params.id))),
  }),
  route({
    method: 'get', path: '/game-versions/:id/preview-url', tag: 'Despliegue', summary: 'Enlace temporal para probar una versión antes de activarla', roles: DEPLOYERS,
    params: idParams,
    response: { status: 200, description: 'El enlace firmado y su vigencia', schema: previewDto },
    handler: async ({ params, req }) => ok(toPreviewDto(await uc.preview.execute({ id: params.id, apiBase: `${req.protocol}://${req.get('host') ?? ''}` }))),
  }),
  route({
    method: 'patch', path: '/game-versions/:id', tag: 'Despliegue', summary: 'Cambia la nota de una versión', roles: DEPLOYERS,
    params: idParams, body: editVersionBody,
    response: { status: 200, description: 'La versión con su nota nueva', schema: versionDto },
    handler: async ({ params, body }) => ok(toVersionDto(await uc.editNotes.execute({ id: params.id, notes: body.notes }))),
  }),
  route({
    method: 'delete', path: '/game-versions/:id', tag: 'Despliegue', summary: 'Elimina una versión que no está activa', roles: DEPLOYERS,
    params: idParams,
    response: { status: 204, description: 'Versión eliminada' },
    handler: async ({ params }) => {
      await uc.remove.execute(params.id)
      return noContent()
    },
  }),
]
