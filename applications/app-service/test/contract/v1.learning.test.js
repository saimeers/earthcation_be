import { createRequire } from 'node:module'
import { describe, it, expect, inject } from 'vitest'

const require = createRequire(import.meta.url)
const { send } = require('../support/contract.cjs')

// API v1: intentos, eventos, resultados por riesgo, niveles y analíticas contra Postgres real.
const s = inject('seed')
const [p1, , p3] = s.players

describe('API v1: telemetría del juego', () => {
  const attempt = {}

  it('abre un intento: 201, Location y outcome in_progress', async () => {
    const res = await send('post', '/api/v1/attempts', p3, { levelKey: 'level1', sessionId: s.session.id, varkStyle: 'Visual', gameVersion: '2.1.2' })
    expect(res.status).toBe(201)
    expect(res.headers.location).toBe(`/api/v1/attempts/${res.body.data.id}`)
    expect(res.body.data).toMatchObject({ levelKey: 'level1', outcome: 'in_progress' })
    Object.assign(attempt, res.body.data)
  })

  it('valida el cuerpo y exige sesión', async () => {
    expect((await send('post', '/api/v1/attempts', p3, {})).body.error.code).toBe('VALIDATION_ERROR')
    expect((await send('post', '/api/v1/attempts', null, { levelKey: 'level1' })).status).toBe(401)
  })

  it('guarda un lote de eventos; el payload conserva sus claves y un lote vacío es 400', async () => {
    const events = [
      { eventType: 'risk_seen', riskId: 'CR-01', stage: 'ingreso', tMs: 1200, payload: { some_key: { inner_key: 1 } } },
      { eventType: 'alarm', tMs: 2500, health: 80 },
    ]
    const res = await send('post', `/api/v1/attempts/${attempt.id}/events`, p3, { events })
    expect([res.status, res.body.data.saved]).toEqual([201, 2])
    expect((await send('post', `/api/v1/attempts/${attempt.id}/events`, p3, { events: [] })).body.error.code).toBe('VALIDATION_ERROR')
    const detail = await send('get', `/api/v1/attempts/${attempt.id}`, s.admin)
    expect(detail.status).toBe(200)
    const stored = JSON.stringify(detail.body)
    expect(stored).toContain('"some_key"')
    expect(stored).toContain('"inner_key"')
    expect(stored).toContain('eventType')
  })

  it('cierra el intento con outcome y duración; un jugador no cierra el de otro', async () => {
    const url = `/api/v1/attempts/${attempt.id}`
    const done = await send('patch', url, p3, { outcome: 'completed', durationMs: 45000, finalHealth: 90, deviceCalibrated: true })
    expect(done.status).toBe(200)
    expect(done.body.data).toMatchObject({ outcome: 'completed', durationMs: 45000 })
    expect(done.body.data.endedAt).toEqual(expect.any(String))
    expect((await send('patch', url, p1, { outcome: 'failed' })).status).toBeGreaterThanOrEqual(400)
    expect((await send('patch', url, p3, { outcome: 'ganado' })).body.error.code).toBe('VALIDATION_ERROR')
  })

  it('el jugador lista sus intentos y el personal los de cualquiera', async () => {
    const mine = await send('get', '/api/v1/attempts/me?levelKey=level1', p3)
    expect(mine.status).toBe(200)
    expect(mine.body.data.some((a) => a.id === attempt.id)).toBe(true)
    expect((await send('get', `/api/v1/users/${p3.id}/attempts`, s.instructor)).status).toBe(200)
    expect((await send('get', `/api/v1/users/${p3.id}/attempts`, p1)).status).toBe(403)
    expect((await send('get', `/api/v1/attempts/${attempt.id}`, p3)).status).toBe(403)
  })

  it('resúmenes de telemetría del jugador y generales', async () => {
    const summary = await send('get', `/api/v1/users/${p3.id}/telemetry-summary?sessionId=${s.session.id}`, s.admin)
    expect(summary.status).toBe(200)
    expect((await send('get', '/api/v1/telemetry/overview', s.developer)).status).toBe(200)
    expect((await send('get', '/api/v1/telemetry/overview', p3)).status).toBe(403)
  })
})

describe('API v1: resultados por riesgo y niveles', () => {
  it('guarda un resultado y lo lista en camelCase, paginado', async () => {
    const saved = await send('post', '/api/v1/risk-results', p3, { riskId: 'CR-01', sessionId: s.session.id, isMitigated: true, mistakesCount: 1, reactionTimeMs: 900 })
    expect(saved.status).toBe(201)
    expect(saved.body.data).toMatchObject({ riskId: 'CR-01', isMitigated: true, mistakesCount: 1, reactionTimeMs: 900 })
    const mine = await send('get', `/api/v1/risk-results/me?sessionId=${s.session.id}&limit=5`, p3)
    expect([mine.status, mine.body.meta.limit]).toEqual([200, 5])
    expect(mine.body.data[0]).toHaveProperty('riskId')
    expect(mine.body.data[0]).not.toHaveProperty('risk_id')
    expect((await send('post', '/api/v1/risk-results', p3, { isMitigated: true })).body.error.code).toBe('VALIDATION_ERROR')
  })

  it('el personal consulta los resultados de un jugador', async () => {
    expect((await send('get', `/api/v1/users/${p1.id}/risk-results`, s.instructor)).status).toBe(200)
    expect((await send('get', `/api/v1/users/${p1.id}/risk-results`, p3)).status).toBe(403)
  })

  it('niveles: lista, detalle y avance del jugador', async () => {
    const list = await send('get', '/api/v1/levels', p3)
    expect(list.status).toBe(200)
    expect(list.body.meta.total).toBeGreaterThanOrEqual(2)
    expect((await send('get', '/api/v1/levels/1', p3)).body.data).toMatchObject({ id: 1 })
    expect((await send('get', '/api/v1/levels/999', p3)).status).toBe(404)
    expect((await send('get', '/api/v1/levels/uno', p3)).body.error.code).toBe('VALIDATION_ERROR')
    expect((await send('get', '/api/v1/levels/1/progress/me', p3)).status).toBe(200)
  })
})

describe('API v1: analíticas', () => {
  it('overview es de admin y desarrollador; el resto, del personal', async () => {
    expect((await send('get', '/api/v1/analytics/overview', s.admin)).status).toBe(200)
    expect((await send('get', '/api/v1/analytics/overview', s.instructor)).status).toBe(403)
    expect((await send('get', `/api/v1/analytics/organizations/${s.org.id}`, s.instructor)).status).toBe(200)
    expect((await send('get', '/api/v1/analytics/locations?department=Norte', s.developer)).status).toBe(200)
    expect((await send('get', '/api/v1/analytics/mines-map', s.admin)).status).toBe(200)
    expect((await send('get', '/api/v1/analytics/mines-map', p3)).status).toBe(403)
  })
})
