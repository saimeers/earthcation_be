import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { GameVersion, type AuthenticatedUser, type Role } from '@earthcation/model'
import { acceptDeployToken, authenticate, createRouterV1, deploymentRoutesV1, type DeploymentUseCases } from '../src'
import { noIdempotency } from './support/noIdempotency'

// El CI del juego sube versiones con la cabecera x-deploy-token. Ese token solo sirve para crear, subir y completar:
// activar, borrar o leer sigue necesitando una persona con su sesión.

const TOKEN = 'token-de-despliegue-de-prueba-con-32-caracteres-o-mas'
const ID = '11111111-1111-4111-8111-111111111111'

const tokens = {
  verify: (token: string): AuthenticatedUser => {
    if (!['admin', 'developer', 'player'].includes(token)) throw new Error('inválido')
    return { id: `u-${token}`, role: token as Role, username: null }
  },
}

const version = (status: 'uploading' | 'processing' | 'ready', uploadedBy: string | null = null) => GameVersion.restore({
  id: ID, label: '2.3.0', notes: null, status, originalKey: `originals/${ID}.zip`, publishedPrefix: null, manifest: null,
  sizeBytes: 1000, error: null, uploadedBy, publishedAt: null, activatedAt: null,
  createdAt: new Date('2026-10-24T00:00:00Z'), updatedAt: new Date('2026-10-24T00:00:00Z'),
})

let calls: { name: string, arg: unknown }[] = []
let deployers = 0
const spy = <T>(name: string, result: () => T) => ({ execute: (arg?: unknown) => { calls.push({ name, arg }); return Promise.resolve(result()) } })

const deployment = {
  status: spy('status', () => ({})),
  list: spy('list', () => []),
  create: spy('create', () => ({ version: version('uploading'), upload: { mode: 'presigned', url: 'https://s3.example/subida' } })),
  receiveZip: spy('receiveZip', () => undefined),
  complete: spy('complete', () => version('processing')),
  activate: spy('activate', () => version('ready')),
  remove: spy('remove', () => undefined),
  editNotes: spy('editNotes', () => version('ready')),
  preview: spy('preview', () => ({ url: 'x', expiresAt: new Date() })),
} as unknown as DeploymentUseCases

// null = sin DEPLOY_UPLOAD_TOKEN (con undefined se usaría el valor por defecto)
const appWith = (secret: string | null = TOKEN) => {
  const app = express()
  app.use(express.json())
  app.use('/api/v1', createRouterV1({
    routes: deploymentRoutesV1({ deployment, maxUploadMb: 10 }),
    authenticate: authenticate(tokens),
    deployToken: acceptDeployToken(secret ?? undefined, () => { deployers += 1 }),
    idempotency: noIdempotency, docsAccess: 'public',
    info: { title: 'Prueba', version: '2.0.0', description: 'x' }, log: () => undefined,
  }))
  return app
}

const NEW_VERSION = { label: '2.3.0', sizeBytes: 1000 }
const errorCode = (res: request.Response): string => (res.body as { error: { code: string } }).error.code
const called = (name: string) => calls.some((c) => c.name === name)

describe('token de despliegue del CI', () => {
  beforeEach(() => { calls = []; deployers = 0 })

  it('crea la versión sin usuario y deja el actor ci para la auditoría', async () => {
    const res = await request(appWith()).post('/api/v1/game-versions').set('x-deploy-token', TOKEN).send(NEW_VERSION)
    expect(res.status).toBe(201)
    expect(calls.find((c) => c.name === 'create')?.arg).toMatchObject({ label: '2.3.0', uploadedBy: null })
    expect(deployers).toBe(1)
  })

  it('sube el ZIP y completa la subida', async () => {
    const app = appWith()
    const upload = await request(app).put(`/api/v1/game-versions/${ID}/upload`).set('x-deploy-token', TOKEN)
      .set('Content-Type', 'application/zip').send(Buffer.from('PK'))
    expect(upload.status).toBe(204)
    const done = await request(app).post(`/api/v1/game-versions/${ID}/completion`).set('x-deploy-token', TOKEN)
    expect(done.status).toBe(200)
    expect(called('receiveZip') && called('complete')).toBe(true)
  })

  it.each([
    ['activar', 'post', `/api/v1/game-versions/${ID}/activation`, 'activate'],
    ['borrar', 'delete', `/api/v1/game-versions/${ID}`, 'remove'],
    ['cambiar la nota', 'patch', `/api/v1/game-versions/${ID}`, 'editNotes'],
    ['listar', 'get', '/api/v1/game-versions', 'list'],
    ['pedir la vista previa', 'get', `/api/v1/game-versions/${ID}/preview-url`, 'preview'],
  ] as const)('no sirve para %s', async (_what, method, path, useCase) => {
    const res = await request(appWith())[method](path).set('x-deploy-token', TOKEN).send({ notes: 'x' })
    expect(res.status).toBe(401)
    expect(errorCode(res)).toBe('TOKEN_REQUIRED')
    expect(called(useCase)).toBe(false)
  })

  it('un token equivocado es 401 y no crea nada', async () => {
    const res = await request(appWith()).post('/api/v1/game-versions').set('x-deploy-token', `${TOKEN}x`).send(NEW_VERSION)
    expect(res.status).toBe(401)
    expect(errorCode(res)).toBe('DEPLOY_TOKEN_INVALID')
    expect(called('create')).toBe(false)
  })

  it.each([['sin token configurado', null], ['con el token configurado vacío', '']] as const)('%s la cabecera nunca entra, ni vacía', async (_what, secret) => {
    for (const sent of [TOKEN, '']) {
      const res = await request(appWith(secret)).post('/api/v1/game-versions').set('x-deploy-token', sent).send(NEW_VERSION)
      expect(res.status).toBe(401)
      expect(errorCode(res)).toBe('DEPLOY_TOKEN_INVALID')
    }
    expect(called('create')).toBe(false)
  })

  it('la cabecera manda sobre la sesión: un token equivocado no se salva con un usuario válido', async () => {
    const res = await request(appWith()).post('/api/v1/game-versions').set('x-deploy-token', 'otro')
      .set('Authorization', 'Bearer developer').send(NEW_VERSION)
    expect(res.status).toBe(401)
    expect(called('create')).toBe(false)
  })

  describe('el panel sigue igual', () => {
    it('un desarrollador crea la versión a su nombre', async () => {
      const res = await request(appWith()).post('/api/v1/game-versions').set('Authorization', 'Bearer developer').send(NEW_VERSION)
      expect(res.status).toBe(201)
      expect(calls.find((c) => c.name === 'create')?.arg).toMatchObject({ uploadedBy: 'u-developer' })
      expect(deployers).toBe(0)
    })

    it('un jugador no puede, y sin sesión tampoco', async () => {
      const app = appWith()
      expect((await request(app).post('/api/v1/game-versions').set('Authorization', 'Bearer player').send(NEW_VERSION)).status).toBe(403)
      expect((await request(app).post('/api/v1/game-versions').send(NEW_VERSION)).status).toBe(401)
      expect(called('create')).toBe(false)
    })
  })

  it('la documentación dice qué rutas aceptan el token', async () => {
    const doc = (await request(appWith()).get('/api/v1/openapi.json')).body as {
      paths: Record<string, Record<string, { security?: Record<string, unknown>[] }>>
      components: { securitySchemes: Record<string, unknown> }
    }
    const schemes = (path: string, method: string) => (doc.paths[path][method].security ?? []).flatMap((s) => Object.keys(s))
    expect(schemes('/game-versions', 'post')).toEqual(['bearerAuth', 'deployToken'])
    expect(schemes('/game-versions/{id}/upload', 'put')).toContain('deployToken')
    expect(schemes('/game-versions/{id}/completion', 'post')).toContain('deployToken')
    expect(schemes('/game-versions/{id}/activation', 'post')).toEqual(['bearerAuth'])
    expect(doc.components.securitySchemes.deployToken).toMatchObject({ type: 'apiKey', in: 'header', name: 'x-deploy-token' })
  })
})
