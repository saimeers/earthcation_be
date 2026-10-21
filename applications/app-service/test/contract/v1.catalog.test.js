import { createRequire } from 'node:module'
import { describe, it, expect, inject } from 'vitest'

const require = createRequire(import.meta.url)
const { send } = require('../support/contract.cjs')

// API v1 (la nueva) del catálogo contra Postgres real: sobre {data, meta}, camelCase, errores con código y
// el documento OpenAPI. Las rutas legacy (/api/...) tienen sus propios snapshots en legacy.*.test.js.
const s = inject('seed')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

describe('API v1: localidades y organizaciones', () => {
  it('lista paginada con sobre, camelCase y sin campos internos', async () => {
    const res = await send('get', '/api/v1/locations?limit=5&sort=municipality')
    expect(res.status).toBe(200)
    expect(res.body.meta).toMatchObject({ page: 1, limit: 5 })
    expect(res.body.meta.total).toBeGreaterThan(5)
    expect(res.body.data).toHaveLength(5)
    expect(Object.keys(res.body.data[0]).sort()).toEqual(['country', 'department', 'id', 'isActive', 'municipality'])
  })

  it('consulta una localidad y responde 404 con código si no existe, 400 si el id no es UUID', async () => {
    const ok = await send('get', `/api/v1/locations/${s.location.id}`)
    expect([ok.status, ok.body.data.id]).toEqual([200, s.location.id])
    const missing = await send('get', '/api/v1/locations/00000000-0000-4000-8000-000000000000')
    expect([missing.status, missing.body.error.code]).toEqual([404, 'LOCATION_NOT_FOUND'])
    const bad = await send('get', '/api/v1/locations/abc')
    expect([bad.status, bad.body.error.code]).toEqual([400, 'VALIDATION_ERROR'])
  })

  it('crear localidad: 401 sin token, 403 de jugador, 201 con Location de instructor, 409 si se repite', async () => {
    const body = { municipality: 'Municipio de prueba v1', department: 'Departamento de prueba' }
    expect((await send('post', '/api/v1/locations', null, body)).status).toBe(401)
    expect((await send('post', '/api/v1/locations', s.players[0], body)).status).toBe(403)
    const created = await send('post', '/api/v1/locations', s.instructor, body)
    expect(created.status).toBe(201)
    expect(created.headers.location).toBe(`/api/v1/locations/${created.body.data.id}`)
    expect(created.body.data.id).toMatch(UUID)
    const again = await send('post', '/api/v1/locations', s.admin, body)
    expect([again.status, again.body.error.code]).toEqual([409, again.body.error.code])
  })

  it('organizaciones: listado, detalle con integrantes y fechas ISO', async () => {
    const list = await send('get', '/api/v1/organizations')
    expect(list.status).toBe(200)
    const detail = await send('get', `/api/v1/organizations/${s.org.id}`)
    expect(detail.body.data).toMatchObject({ id: s.org.id, isActive: true })
    expect(new Date(detail.body.data.createdAt).toISOString()).toBe(detail.body.data.createdAt)
    expect(Array.isArray(detail.body.data.members)).toBe(true)
  })

  it('habilitar y deshabilitar es solo de admin', async () => {
    const url = `/api/v1/organizations/${s.org.id}/active`
    expect((await send('put', url, s.instructor, { isActive: false })).status).toBe(403)
    const off = await send('put', url, s.admin, { isActive: false })
    expect([off.status, off.body.data.isActive]).toEqual([200, false])
    expect((await send('put', url, s.admin, { isActive: true })).body.data.isActive).toBe(true)
  })

  it('publica el OpenAPI 3.1 y Swagger UI', async () => {
    const doc = await send('get', '/api/v1/openapi.json')
    expect([doc.status, doc.body.openapi]).toEqual([200, '3.1.0'])
    expect(Object.keys(doc.body.paths)).toEqual(expect.arrayContaining(['/locations', '/locations/{id}', '/organizations/{id}/active']))
    expect((await send('get', '/api/v1/docs/')).status).toBe(200)
  })

  it('una ruta v1 desconocida responde con el formato nuevo y las legacy con el suyo', async () => {
    expect((await send('get', '/api/v1/nada')).body).toEqual({ error: { code: 'ROUTE_NOT_FOUND', message: 'Ruta no encontrada' } })
    expect((await send('get', '/api/nada')).body).toEqual({ error: 'Ruta no encontrada' })
  })
})
