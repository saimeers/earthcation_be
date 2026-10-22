import type { RequestHandler } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp, rateLimiters, type AppRoutesLegacy, type LocationUseCases, type OrganizationUseCases } from '../src'
import { authenticate, catalogRoutesV1, createRouterV1 } from '../src'
import { noIdempotency } from './support/noIdempotency'

const noop: RequestHandler = (_req, res) => { res.json({ ok: true }) }
const pass: RequestHandler = (_req, _res, next) => { next() }

const routes = Object.fromEntries(
  ['publicHealth', 'playLocal', 'visits', 'auth', 'users', 'bulkImport', 'locations', 'organizations', 'vark', 'health', 'deploy', 'progress', 'levels', 'analytics', 'telemetry', 'sessions']
    .map((name) => [name, noop]),
) as unknown as AppRoutesLegacy

const tokens = { verify: () => ({ id: 'u', role: 'admin' as const, username: null }) }
const unused = {} as unknown as LocationUseCases & OrganizationUseCases

const appWith = (userMax = 1000) => {
  const limiters = rateLimiters({
    limits: { userMax, ipMax: userMax, authMax: 100, loginCedulaMax: 100, loginIpFailMax: 100, joinMax: 100 },
    tokens, clientIp: (req) => req.ip, cedulaExists: () => Promise.resolve(false),
  })
  const routesV1 = createRouterV1({
    routes: catalogRoutesV1({ locations: unused, organizations: unused as unknown as OrganizationUseCases }),
    authenticate: authenticate(tokens), idempotency: noIdempotency, docsAccess: 'public', info: { title: 't', version: '2', description: 'x' }, log: () => undefined,
  })
  return createApp({ routes, routesV1, limiters, metrics: pass, requestContext: pass, maskedRoles: [], allowedOrigins: [], servePlayLocal: false, log: () => undefined })
}

describe('createApp: errores y límites según la versión', () => {
  it('un JSON mal formado responde en el formato de cada versión', async () => {
    const app = appWith()
    const legacy = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{')
    expect([legacy.status, legacy.body]).toEqual([400, { error: expect.any(String) as string }])
    const v1 = await request(app).post('/api/v1/locations').set('Content-Type', 'application/json').send('{')
    expect([v1.status, v1.body]).toEqual([400, { error: { code: 'MALFORMED_REQUEST', message: expect.any(String) as string } }])
  })

  it('una ruta desconocida: 404 de legacy en /api y 404 de v1 en /api/v1', async () => {
    const app = appWith()
    expect((await request(app).get('/api/nada')).body).toEqual({ error: 'Ruta no encontrada' })
    expect((await request(app).get('/api/v1/nada')).body).toEqual({ error: { code: 'ROUTE_NOT_FOUND', message: 'Ruta no encontrada' } })
  })

  it('el límite global también cubre v1 y responde RATE_LIMITED', async () => {
    const app = appWith(1)
    await request(app).get('/api/v1/nada')
    const limited = await request(app).get('/api/v1/nada')
    expect([limited.status, limited.body]).toEqual([429, { error: { code: 'RATE_LIMITED', message: expect.any(String) as string } }])
    const legacy = await request(appWith(1)).get('/api/x')
    expect(legacy.status).toBe(404)
  })

  it('legacy y v1 conviven: la raíz y /health siguen respondiendo', async () => {
    const app = appWith()
    expect((await request(app).get('/health')).body).toMatchObject({ status: 'ok' })
    expect((await request(app).get('/')).status).toBe(200)
  })
})
