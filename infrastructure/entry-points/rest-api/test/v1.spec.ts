import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import {
  BusinessRuleError, Location, NotFoundError, Organization, type AuthenticatedUser, type Role,
} from '@earthcation/model'
import { authenticate, catalogRoutesV1, createRouterV1, type LocationUseCases, type OrganizationUseCases } from '../src'

// Token de prueba: "Bearer <rol>" es válido para ese rol; cualquier otro, inválido
const tokens = {
  verify: (token: string): AuthenticatedUser => {
    if (!['admin', 'instructor', 'player', 'developer'].includes(token)) throw new Error('inválido')
    return { id: `u-${token}`, role: token as Role, username: null }
  },
}

const ID = { one: '11111111-1111-4111-8111-111111111111', two: '22222222-2222-4222-8222-222222222222', three: '33333333-3333-4333-8333-333333333333', nine: '99999999-9999-4999-8999-999999999999', none: '00000000-0000-4000-8000-000000000000', org1: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', org2: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }

const place = (id: string, municipality: string, isActive = true) =>
  Location.restore({ id, municipality, department: 'Norte de Santander', country: 'Colombia', isActive })

const PLACES = [place(ID.one, 'Tibú'), place(ID.two, 'Cúcuta'), place(ID.three, 'Sardinata', false)]

const calls: { name: string, arg: unknown }[] = []
const spy = <T>(name: string, result: () => T) => ({ execute: (arg?: unknown) => { calls.push({ name, arg }); return Promise.resolve(result()) } })

const locations = {
  list: spy('list', () => PLACES),
  search: spy('search', () => PLACES.filter((l) => l.isActive)),
  get: { execute: (id: string) => (id === ID.one ? Promise.resolve(PLACES[0]) : Promise.reject(new NotFoundError('LOCATION_NOT_FOUND', 'Localidad no encontrada'))) },
  create: spy('create', () => place(ID.nine, 'Convención')),
  update: spy('update', () => place(ID.one, 'Tibú Centro')),
  changeStatus: { execute: () => Promise.reject(new BusinessRuleError('LOCATION_IN_USE', 'La localidad tiene sesiones activas')) },
} as unknown as LocationUseCases

const organizations = {
  list: spy('olist', () => []), search: spy('osearch', () => []), types: spy('types', () => ['Mina', 'Empresa']),
  get: spy('oget', () => ({ organization: Organization.restore({ id: ID.org1, name: 'Mina La Prueba', type: 'Mina', isActive: true, createdAt: new Date('2026-10-01T10:00:00Z') }), members: [] })),
  create: spy('ocreate', () => Organization.restore({ id: ID.org2, name: 'Nueva', type: null, isActive: true, createdAt: new Date('2026-10-02T00:00:00Z') })),
  update: spy('oupdate', () => PLACES[0]), changeStatus: spy('ostatus', () => PLACES[0]),
} as unknown as OrganizationUseCases

const appWith = (docsAccess: 'public' | 'staff' = 'public') => {
  const logs: string[] = []
  const app = express()
  app.use(express.json())
  app.use('/api/v1', createRouterV1({
    routes: catalogRoutesV1({ locations, organizations }), authenticate: authenticate(tokens), docsAccess,
    info: { title: 'Prueba', version: '2.0.0', description: 'x' }, log: (m) => logs.push(m),
  }))
  return { app, logs }
}

describe('API v1', () => {
  it('lista con sobre {data, meta}, orden y paginación', async () => {
    const res = await request(appWith().app).get('/api/v1/locations?sort=municipality&limit=1&page=2')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      data: [{ id: ID.one, municipality: 'Tibú', department: 'Norte de Santander', country: 'Colombia', isActive: true }],
      meta: { page: 2, limit: 1, total: 2, totalPages: 2 },
    })
  })

  it('sort con "-" es descendente y un campo no permitido se ignora', async () => {
    const { app } = appWith()
    const desc = await request(app).get('/api/v1/locations?sort=-municipality')
    expect((desc.body as { data: { municipality: string }[] }).data.map((l) => l.municipality)).toEqual(['Tibú', 'Cúcuta'])
    const unknown = await request(app).get('/api/v1/locations?sort=password')
    expect(unknown.status).toBe(200)
  })

  it('includeInactive trae también las deshabilitadas', async () => {
    const res = await request(appWith().app).get('/api/v1/locations?includeInactive=true')
    expect((res.body as { meta: { total: number } }).meta.total).toBe(3)
  })

  it('un parámetro inválido es 400 VALIDATION_ERROR con el campo', async () => {
    const res = await request(appWith().app).get('/api/v1/locations?limit=500')
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ error: { code: 'VALIDATION_ERROR', details: [{ field: 'query.limit' }] } })
  })

  it('un id que no es UUID es 400, no un error de la base de datos', async () => {
    const res = await request(appWith().app).get('/api/v1/locations/abc')
    expect([res.status, (res.body as { error: { code: string } }).error.code]).toEqual([400, 'VALIDATION_ERROR'])
  })

  it('un recurso que no existe es 404 con el código del dominio', async () => {
    const res = await request(appWith().app).get(`/api/v1/locations/${ID.none}`)
    expect([res.status, res.body]).toEqual([404, { error: { code: 'LOCATION_NOT_FOUND', message: 'Localidad no encontrada' } }])
  })

  it('crear exige token y rol, valida el cuerpo y responde 201 con Location', async () => {
    const { app } = appWith()
    const body = { municipality: 'Convención', department: 'Norte de Santander' }
    expect((await request(app).post('/api/v1/locations').send(body)).status).toBe(401)
    expect((await request(app).post('/api/v1/locations').set('Authorization', 'Bearer player').send(body)).status).toBe(403)
    const invalid = await request(app).post('/api/v1/locations').set('Authorization', 'Bearer admin').send({ municipality: '' })
    expect([invalid.status, (invalid.body as { error: { code: string } }).error.code]).toEqual([400, 'VALIDATION_ERROR'])
    const res = await request(app).post('/api/v1/locations').set('Authorization', 'Bearer instructor').send(body)
    expect([res.status, res.headers.location]).toEqual([201, `/api/v1/locations/${ID.nine}`])
    expect(res.body).toMatchObject({ data: { id: ID.nine, municipality: 'Convención' } })
  })

  it('una regla de negocio incumplida es 422 (en v1 era 400)', async () => {
    const res = await request(appWith().app).put(`/api/v1/locations/${ID.one}/active`).set('Authorization', 'Bearer admin').send({ isActive: false })
    expect([res.status, res.body]).toEqual([422, { error: { code: 'LOCATION_IN_USE', message: 'La localidad tiene sesiones activas' } }])
  })

  it('las fechas salen en ISO 8601 y los campos en camelCase', async () => {
    const res = await request(appWith().app).get(`/api/v1/organizations/${ID.org1}`)
    expect(res.body).toMatchObject({ data: { id: ID.org1, isActive: true, createdAt: '2026-10-01T10:00:00.000Z', members: [] } })
  })

  it('ruta desconocida tiene su código; un 5xx no expone el detalle', async () => {
    const { app, logs } = appWith()
    expect((await request(app).get('/api/v1/nada')).body).toEqual({ error: { code: 'ROUTE_NOT_FOUND', message: 'Ruta no encontrada' } })
    const broken = { ...locations, get: { execute: () => Promise.reject(new Error('relation "x" does not exist')) } } as unknown as LocationUseCases
    const app2 = express().use('/api/v1', createRouterV1({
      routes: catalogRoutesV1({ locations: broken, organizations }), authenticate: authenticate(tokens), docsAccess: 'public',
      info: { title: 'p', version: '2', description: 'x' }, log: (m) => logs.push(m),
    }))
    const res = await request(app2).get(`/api/v1/locations/${ID.one}`)
    expect([res.status, res.body]).toEqual([500, { error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } }])
    expect(logs.join('')).toContain('relation "x" does not exist')
  })

  it('el OpenAPI describe rutas, seguridad, paginación y errores', async () => {
    const res = await request(appWith().app).get('/api/v1/openapi.json')
    const doc = res.body as { openapi: string, paths: Record<string, Record<string, Record<string, unknown>>> }
    expect(doc.openapi).toBe('3.1.0')
    expect(Object.keys(doc.paths)).toContain('/locations/{id}')
    const list = doc.paths['/locations']?.get
    expect(JSON.stringify(list?.responses)).toContain('#/components/schemas/PageMeta')
    expect(doc.paths['/locations']?.post?.security).toEqual([{ bearerAuth: [] }])
    expect(list?.security).toBeUndefined()
    expect(Object.keys(doc.paths['/locations/{id}/active']?.put?.responses ?? {})).toEqual(expect.arrayContaining(['200', '400', '401', '403', '404', '500']))
  })

  it('docs "staff" piden token de admin o desarrollador', async () => {
    const { app } = appWith('staff')
    expect((await request(app).get('/api/v1/openapi.json')).status).toBe(401)
    expect((await request(app).get('/api/v1/openapi.json').set('Authorization', 'Bearer player')).status).toBe(403)
    expect((await request(app).get('/api/v1/openapi.json').set('Authorization', 'Bearer developer')).status).toBe(200)
  })

  it('Swagger UI responde HTML', async () => {
    const res = await request(appWith().app).get('/api/v1/docs/')
    expect([res.status, res.headers['content-type']]).toEqual([200, expect.stringContaining('text/html')])
  })
})
