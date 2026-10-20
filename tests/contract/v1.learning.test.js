import { createRequire } from 'node:module'
import { describe, it, expect, inject } from 'vitest'

const require = createRequire(import.meta.url)
const { send, contract } = require('../support/contract.cjs')

// Aprendizaje (progreso, niveles, telemetría, analítica): además de la forma, los VALORES calculados
// (porcentajes del último intento, agregados, coordenadas) sobre la semilla fija. Ids y fechas cambian en
// cada corrida y se enmascaran; todo lo demás debe salir igual.
const s = inject('seed')
const [p1, p2] = s.players

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2}))?$/
const VOLATILE = new Set(['code', 'cedula', 'username', 'week', 'day'])

const stable = (v, key = '') => {
  if (Array.isArray(v)) return v.map((x) => stable(x))
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [UUID.test(k) ? '<uuid>' : k, stable(v[k], k)]))
  if (typeof v === 'string' && UUID.test(v)) return '<uuid>'
  if (typeof v === 'string' && ISO.test(v)) return '<date>'
  if (VOLATILE.has(key) && v !== null) return `<${key}>`
  return v
}

const golden = async (url, who = s.admin) => {
  const res = await send('get', url, who)
  expect(res.status).toBe(200)
  expect(stable(res.body)).toMatchSnapshot()
}

// [nombre fijo del snapshot, URL real]
describe('valores de las lecturas de aprendizaje', () => {
  it.each([
    ['analytics/overview', '/api/analytics/overview'],
    ['analytics/organization/:orgId', `/api/analytics/organization/${s.org.id}`],
    ['analytics/location?department&municipality', '/api/analytics/location?department=Norte%20de%20Santander&municipality=C%C3%BAcuta'],
    ['analytics/map', '/api/analytics/map'],
    ['levels', '/api/levels'],
    ['levels/2', '/api/levels/2'],
    ['telemetry/overview', '/api/telemetry/overview'],
    ['telemetry/overview?session_id', `/api/telemetry/overview?session_id=${s.session.id}`],
    ['telemetry/users/:userId/summary', `/api/telemetry/users/${p1.id}/summary`],
    ['telemetry/users/:userId/summary?session_id', `/api/telemetry/users/${p1.id}/summary?session_id=${s.session.id}`],
    ['telemetry/users/:userId/attempts?level_key', `/api/telemetry/users/${p1.id}/attempts?level_key=level1`],
    ['telemetry/attempts/:id', `/api/telemetry/attempts/${s.attempts[0]}`],
    ['progress/user/:userId/history?session_id', `/api/progress/user/${p1.id}/history?session_id=${s.session.id}`],
  ])('%s', (_, url) => golden(url))

  it.each([
    ['progress/level/1', '/api/progress/level/1'],
    ['progress/level/2', '/api/progress/level/2'],
    ['progress/full', '/api/progress/full'],
    ['progress/me/:sessionId', `/api/progress/me/${s.session.id}`],
    ['telemetry/me/attempts?level_key', '/api/telemetry/me/attempts?level_key=level1'],
  ])('%s como jugador', (_, url) => golden(url, p1))

  it('progreso por nivel del segundo jugador', () => golden('/api/progress/level/1', p2))
})

describe('casos borde sin escritura', () => {
  const missing = '00000000-0000-0000-0000-000000000000'
  const snap = async (res) => expect(contract(await res)).toMatchSnapshot()

  it('cerrar o mandar eventos a un intento ajeno o inexistente', async () => {
    await snap(send('patch', `/api/telemetry/attempts/${missing}`, p1, { outcome: 'failed' }))
    await snap(send('post', '/api/telemetry/events', p1, { attempt_id: missing, events: [{ event_type: 'x' }] }))
    await snap(send('post', '/api/telemetry/events', p1, { attempt_id: s.attempts[0], events: [{ t_ms: 1 }] }))
    await snap(send('post', '/api/telemetry/events', p1, { events: [{ event_type: 'x' }] }))
  })
  it('detalle de intento inexistente', () => snap(send('get', `/api/telemetry/attempts/${missing}`, s.admin)))
  it('progreso sin riesgo', () => snap(send('post', '/api/progress/save', p1, { is_mitigated: true })))
  it('nivel sin datos del jugador', () => golden('/api/progress/level/3', p1))
  it('analítica de organización sin jugadores y localidad inexistente', async () => {
    await golden(`/api/analytics/organization/${missing}`)
    await golden('/api/analytics/location?department=Amazonas')
  })
})
