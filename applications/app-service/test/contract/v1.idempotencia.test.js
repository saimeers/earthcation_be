import { createRequire } from 'node:module'
import { describe, it, expect, inject } from 'vitest'

const require = createRequire(import.meta.url)
const request = require('supertest')
const { send, app } = require('../support/contract.cjs')
const { tokenFor } = require('../support/auth.cjs')
const { sequelize } = require('../../dist/container')

// Idempotency-Key contra Postgres real: un reintento de red no duplica intentos, eventos ni progreso.
const s = inject('seed')

const post = (path, who, body, key) => {
  const req = request(app).post(path).set('Authorization', `Bearer ${tokenFor(who)}`)
  return (key ? req.set('Idempotency-Key', key) : req).send(body)
}

// Un jugador propio por prueba: así se cuentan sus filas sin depender de las de otras pruebas
let n = 0
const newPlayer = async () => {
  n += 1
  const cedula = `95000100${String(n).padStart(2, '0')}`
  const res = await send('post', '/api/v1/users', s.admin, { cedula, firstName: 'Idem', lastName: 'Potente', role: 'player' })
  return { id: res.body.data.id, cedula, role: 'player' }
}

const count = async (table, userId) => {
  const [rows] = await sequelize.query(`SELECT count(*)::int AS n FROM ${table} WHERE user_id = :userId`, { replacements: { userId } })
  return rows[0].n
}

const attemptBody = { levelKey: 'level1', varkStyle: 'Visual', gameVersion: '2.1.3' }

describe('Idempotency-Key: intentos', () => {
  it('el reintento devuelve el mismo intento (201, Location, Idempotent-Replayed) y no abre otro', async () => {
    const p = await newPlayer()
    const first = await post('/api/v1/attempts', p, attemptBody, 'intento-nivel-1-aaaa')
    const retry = await post('/api/v1/attempts', p, attemptBody, 'intento-nivel-1-aaaa')
    expect([first.status, retry.status]).toEqual([201, 201])
    expect(retry.body).toEqual(first.body)
    expect(retry.headers.location).toBe(first.headers.location)
    expect([first.headers['idempotent-replayed'], retry.headers['idempotent-replayed']]).toEqual([undefined, 'true'])
    expect(await count('level_attempts', p.id)).toBe(1)
  })

  it('sin cabecera sigue como antes: cada petición abre un intento', async () => {
    const p = await newPlayer()
    await post('/api/v1/attempts', p, attemptBody)
    await post('/api/v1/attempts', p, attemptBody)
    expect(await count('level_attempts', p.id)).toBe(2)
  })

  it('la misma clave con otro cuerpo es 422; otro jugador con esa clave es independiente; una clave mal formada es 400', async () => {
    const [a, b] = [await newPlayer(), await newPlayer()]
    await post('/api/v1/attempts', a, attemptBody, 'clave-compartida-01')
    const reused = await post('/api/v1/attempts', a, { ...attemptBody, levelKey: 'level2' }, 'clave-compartida-01')
    expect([reused.status, reused.body.error.code]).toEqual([422, 'IDEMPOTENCY_KEY_REUSED'])
    expect((await post('/api/v1/attempts', b, attemptBody, 'clave-compartida-01')).headers['idempotent-replayed']).toBeUndefined()
    const bad = await post('/api/v1/attempts', a, attemptBody, 'corta')
    expect([bad.status, bad.body.error.code]).toEqual([400, 'IDEMPOTENCY_KEY_INVALID'])
    expect(await count('level_attempts', a.id)).toBe(1)
  })

  it('cinco peticiones simultáneas con la misma clave abren un solo intento', async () => {
    const p = await newPlayer()
    const results = await Promise.all(Array.from({ length: 5 }, () => post('/api/v1/attempts', p, attemptBody, 'carrera-simultanea-1')))
    const statuses = results.map((r) => r.status)
    expect(statuses.every((st) => st === 201 || st === 409)).toBe(true)
    expect(statuses.filter((st) => st === 201).length).toBeGreaterThanOrEqual(1)
    expect(await count('level_attempts', p.id)).toBe(1)
    const retry = await post('/api/v1/attempts', p, attemptBody, 'carrera-simultanea-1')
    expect([retry.status, retry.headers['idempotent-replayed']]).toEqual([201, 'true'])
  })

  it('un error no gasta la clave: el reintento corregido se ejecuta', async () => {
    const p = await newPlayer()
    expect((await post('/api/v1/attempts', p, {}, 'clave-con-error-01')).status).toBe(400)
    expect((await post('/api/v1/attempts', p, attemptBody, 'clave-con-error-01')).status).toBe(201)
    expect(await count('level_attempts', p.id)).toBe(1)
  })
})

describe('Idempotency-Key: eventos y progreso', () => {
  it('un lote de eventos reenviado no duplica los eventos', async () => {
    const p = await newPlayer()
    const attempt = (await post('/api/v1/attempts', p, attemptBody)).body.data
    const events = { events: [{ eventType: 'risk_seen', riskId: 'CR-01', tMs: 100 }, { eventType: 'alarm', tMs: 200 }] }
    const first = await post(`/api/v1/attempts/${attempt.id}/events`, p, events, 'lote-eventos-0001')
    const retry = await post(`/api/v1/attempts/${attempt.id}/events`, p, events, 'lote-eventos-0001')
    expect([first.body.data.saved, retry.body.data.saved, retry.headers['idempotent-replayed']]).toEqual([2, 2, 'true'])
    const [rows] = await sequelize.query('SELECT count(*)::int AS n FROM game_events WHERE attempt_id = :id', { replacements: { id: attempt.id } })
    expect(rows[0].n).toBe(2)
    // Otro lote (otra clave) sí se guarda
    await post(`/api/v1/attempts/${attempt.id}/events`, p, events, 'lote-eventos-0002')
    const [after] = await sequelize.query('SELECT count(*)::int AS n FROM game_events WHERE attempt_id = :id', { replacements: { id: attempt.id } })
    expect(after[0].n).toBe(4)
  })

  it('un resultado por riesgo reenviado no suma otro registro de progreso', async () => {
    const p = await newPlayer()
    const body = { riskId: 'CR-01', isMitigated: true, mistakesCount: 0, reactionTimeMs: 800 }
    const first = await post('/api/v1/risk-results', p, body, 'riesgo-cr01-0001')
    const retry = await post('/api/v1/risk-results', p, body, 'riesgo-cr01-0001')
    expect([first.status, retry.status, retry.headers['idempotent-replayed']]).toEqual([201, 201, 'true'])
    expect(await count('user_risk_progress', p.id)).toBe(1)
  })
})

describe('Idempotency-Key: claves vencidas y abandonadas', () => {
  const body = { levelKey: 'level1', varkStyle: 'Visual', gameVersion: '2.1.3' }

  it('una clave de hace más de un día se olvida: la misma clave vuelve a ejecutar', async () => {
    const p = await newPlayer()
    await post('/api/v1/attempts', p, body, 'clave-vencida-0001')
    await sequelize.query("UPDATE idempotency_keys SET created_at = now() - interval '2 days' WHERE user_id = :id", { replacements: { id: p.id } })
    const again = await post('/api/v1/attempts', p, body, 'clave-vencida-0001')
    expect([again.status, again.headers['idempotent-replayed']]).toEqual([201, undefined])
    expect(await count('level_attempts', p.id)).toBe(2)
  })

  it('una ejecución abandonada (en curso hace más de 2 minutos) la toma el reintento; una reciente responde 409', async () => {
    const p = await newPlayer()
    const insert = `INSERT INTO idempotency_keys (user_id, key, fingerprint, locked_at, created_at) VALUES (:id, 'clave-en-curso-01', :fp, now() - interval ':age', now())`
    const fingerprintOf = async () => {
      await post('/api/v1/attempts', p, body, 'clave-en-curso-01')
      const [rows] = await sequelize.query("SELECT fingerprint FROM idempotency_keys WHERE user_id = :id AND key = 'clave-en-curso-01'", { replacements: { id: p.id } })
      await sequelize.query('DELETE FROM idempotency_keys WHERE user_id = :id', { replacements: { id: p.id } })
      await sequelize.query('DELETE FROM level_attempts WHERE user_id = :id', { replacements: { id: p.id } })
      return rows[0].fingerprint
    }
    const fp = await fingerprintOf()
    await sequelize.query(insert.replace(':age', '10 seconds'), { replacements: { id: p.id, fp } })
    const busy = await post('/api/v1/attempts', p, body, 'clave-en-curso-01')
    expect([busy.status, busy.body.error.code]).toEqual([409, 'IDEMPOTENCY_IN_PROGRESS'])
    await sequelize.query('DELETE FROM idempotency_keys WHERE user_id = :id', { replacements: { id: p.id } })
    await sequelize.query(insert.replace(':age', '5 minutes'), { replacements: { id: p.id, fp } })
    const taken = await post('/api/v1/attempts', p, body, 'clave-en-curso-01')
    expect(taken.status).toBe(201)
    expect(await count('level_attempts', p.id)).toBe(1)
  })
})

describe('Idempotency-Key: documentación', () => {
  it('el OpenAPI declara la cabecera en las tres rutas del juego y en ninguna otra', async () => {
    const doc = (await send('get', '/api/v1/openapi.json', s.admin)).body
    const withHeader = Object.entries(doc.paths).flatMap(([path, ops]) => Object.entries(ops)
      .filter(([, op]) => (op.parameters ?? []).some((q) => q.name === 'Idempotency-Key')).map(([method]) => `${method.toUpperCase()} ${path}`)).sort()
    expect(withHeader).toEqual(['POST /attempts', 'POST /attempts/{id}/events', 'POST /risk-results'])
  })
})
