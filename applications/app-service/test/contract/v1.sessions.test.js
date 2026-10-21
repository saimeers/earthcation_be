import { createRequire } from 'node:module'
import { describe, it, expect, inject } from 'vitest'

const require = createRequire(import.meta.url)
const { send } = require('../support/contract.cjs')

// API v1: salas de capacitación contra Postgres real (la semilla trae una sala iniciada con dos jugadores).
const s = inject('seed')
const [p1, p2, p3] = s.players

const binary = (req) => req.buffer(true).parse((r, cb) => { const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))) })
const hasSnakeKey = (value) => {
  if (Array.isArray(value)) return value.some(hasSnakeKey)
  if (value === null || typeof value !== 'object') return false
  return Object.entries(value).some(([k, v]) => (/_/.test(k) && !['fail_reasons', 'fail_stages'].includes(k) ? true : false) || hasSnakeKey(v))
}

describe('API v1: ciclo de una sala', () => {
  const room = {}

  it('el instructor abre una sala: 201, Location y código de 3 dígitos', async () => {
    const res = await send('post', '/api/v1/sessions', s.instructor, { name: 'Sala v1', locationId: s.location.id })
    expect(res.status).toBe(201)
    expect(res.headers.location).toBe(`/api/v1/sessions/${res.body.data.id}`)
    expect(res.body.data.code).toMatch(/^\d{3}$/)
    expect(res.body.data).toMatchObject({ name: 'Sala v1', status: 'waiting' })
    Object.assign(room, res.body.data)
  })

  it('un jugador no abre salas y el cuerpo se valida', async () => {
    expect((await send('post', '/api/v1/sessions', p1, { name: 'x', locationId: s.location.id })).status).toBe(403)
    expect((await send('post', '/api/v1/sessions', s.instructor, { name: '' })).body.error.code).toBe('VALIDATION_ERROR')
  })

  it('el juego valida el código y el jugador se une; unirse de nuevo no es error', async () => {
    const byCode = await send('get', `/api/v1/sessions/code/${room.code}`, p3)
    expect([byCode.status, byCode.body.data.id]).toEqual([200, room.id])
    const first = await send('post', '/api/v1/sessions/join', p3, { code: room.code })
    expect([first.status, first.body.data.joined]).toEqual([200, true])
    expect((await send('post', '/api/v1/sessions/join', p3, { code: room.code })).body.data.joined).toBe(false)
    expect((await send('post', '/api/v1/sessions/join', p3, { code: '000' })).status).toBe(404)
  })

  it('solo el instructor dueño inicia y termina la sala', async () => {
    const url = `/api/v1/sessions/${room.id}/status`
    expect((await send('put', url, s.admin, { status: 'active' })).status).toBe(403)
    expect((await send('put', url, s.instructor, { status: 'waiting' })).body.error.code).toBe('VALIDATION_ERROR')
    const active = await send('put', url, s.instructor, { status: 'active' })
    expect([active.status, active.body.data.status]).toEqual([200, 'active'])
    const ended = await send('put', url, s.instructor, { status: 'finished' })
    expect([ended.status, ended.body.data.status]).toEqual([200, 'finished'])
  })

  it('una sala terminada ya no admite jugadores (regla de negocio: 422)', async () => {
    const res = await send('post', '/api/v1/sessions/join', p2, { code: room.code })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toEqual(expect.any(String))
  })
})

describe('API v1: listados y detalle', () => {
  it('el instructor lista las suyas y no puede pedir todas; admin y desarrollador sí', async () => {
    const mine = await send('get', '/api/v1/sessions?limit=50', s.instructor)
    expect(mine.status).toBe(200)
    expect(mine.body.meta.total).toBeGreaterThanOrEqual(1)
    expect(mine.body.data[0]).toHaveProperty('startedAt')
    expect((await send('get', '/api/v1/sessions?scope=all', s.instructor)).status).toBe(403)
    expect((await send('get', '/api/v1/sessions', s.admin)).body.meta.total).toBeGreaterThanOrEqual(mine.body.meta.total)
    expect((await send('get', '/api/v1/sessions', s.developer)).status).toBe(200)
    expect((await send('get', '/api/v1/sessions', p1)).status).toBe(403)
  })

  it('detalle de la sala en camelCase; las claves de datos (motivos, etapas) se conservan', async () => {
    const res = await send('get', `/api/v1/sessions/${s.session.id}`, s.admin)
    expect(res.status).toBe(200)
    expect(Object.keys(res.body.data)).toEqual(expect.arrayContaining(['participants', 'levels', 'failReasons']))
    expect(res.body.data.participants[0]).toHaveProperty('avgReactionMs')
    expect(res.body.data.participants[0]).not.toHaveProperty('avg_reaction_ms')
    expect(hasSnakeKey(res.body.data)).toBe(false)
    expect(res.body.data.levels[0].failReasons).toHaveProperty('derrumbe')
  })

  it('análisis de un participante y permisos del detalle', async () => {
    const analysis = await send('get', `/api/v1/sessions/${s.session.id}/participants/${p1.id}/analysis`, s.instructor)
    expect(analysis.status).toBe(200)
    expect((await send('get', `/api/v1/sessions/${s.session.id}`, p1)).status).toBe(403)
    expect((await send('get', '/api/v1/sessions/xyz', s.admin)).body.error.code).toBe('VALIDATION_ERROR')
  })

  it('el informe se descarga como Excel con su nombre', async () => {
    const res = await binary(send('get', `/api/v1/sessions/${s.session.id}/report.xlsx`, s.instructor))
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/spreadsheetml/)
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="sesion-\d{3}-\d{4}-\d{2}-\d{2}\.xlsx"$/)
    expect(res.body.subarray(0, 2).toString()).toBe('PK')
  })

  it('el OpenAPI documenta el Excel como binario', async () => {
    const doc = await send('get', '/api/v1/openapi.json')
    const content = doc.body.paths['/sessions/{id}/report.xlsx'].get.responses['200'].content
    expect(Object.keys(content)[0]).toMatch(/spreadsheetml/)
  })
})
