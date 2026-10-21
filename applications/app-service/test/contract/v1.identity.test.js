import { createRequire } from 'node:module'
import { describe, it, expect, inject } from 'vitest'

const require = createRequire(import.meta.url)
const { send } = require('../support/contract.cjs')

// API v1: autenticación, usuarios y test VARK contra Postgres real.
const s = inject('seed')
const [player] = s.players

describe('API v1: autenticación', () => {
  it('el jugador entra solo con la cédula y recibe su cuenta en camelCase', async () => {
    const res = await send('post', '/api/v1/auth/login', null, { cedula: player.cedula })
    expect(res.status).toBe(200)
    expect(res.body.data.token).toEqual(expect.any(String))
    expect(Object.keys(res.body.data.user).sort()).toEqual([
      'cedula', 'dominantStyle', 'email', 'firstName', 'id', 'lastName', 'location', 'organization', 'role', 'username', 'varkCompleted',
    ])
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i)
  })

  it('el personal necesita la contraseña; con ella entra', async () => {
    const without = await send('post', '/api/v1/auth/login', null, { cedula: s.admin.cedula })
    expect(without.status).toBe(401)
    expect(without.body.error.code).toEqual(expect.any(String))
    const ok = await send('post', '/api/v1/auth/login', null, { cedula: s.admin.cedula, password: s.staffPassword })
    expect([ok.status, ok.body.data.user.role]).toEqual([200, 'admin'])
  })

  it('cuerpo inválido es 400 y la cédula inexistente es 401', async () => {
    expect((await send('post', '/api/v1/auth/login', null, {})).body.error.code).toBe('VALIDATION_ERROR')
    expect((await send('post', '/api/v1/auth/login', null, { cedula: '0000000000' })).status).toBe(401)
  })

  it('el límite de intentos por cédula también cubre v1', async () => {
    const statuses = []
    for (let i = 0; i < 13; i++) statuses.push(await send('post', '/api/v1/auth/login', null, { cedula: '777000111' }))
    const limited = statuses.find((r) => r.status === 429)
    expect(limited?.body.error.code).toBe('RATE_LIMITED')
  })

  it('solicitar el restablecimiento responde 202 siempre; el correo debe ser válido', async () => {
    const res = await send('post', '/api/v1/auth/password-resets', null, { email: 'nadie@earthcation.test' })
    expect([res.status, res.body.data.message]).toEqual([202, expect.any(String)])
    expect((await send('post', '/api/v1/auth/password-resets', null, { email: 'no-es-correo' })).status).toBe(400)
  })
})

describe('API v1: test VARK', () => {
  it('el jugador guarda y consulta su resultado', async () => {
    const put = await send('put', '/api/v1/vark-results/me', player, { answers: { q1: 'B', q2: 'A', q3: 'C', q4: 'B' } })
    expect(put.status).toBe(200)
    expect(put.body.data).toMatchObject({ visualScore: 2, auditoryScore: 1, readingScore: 1, dominantStyle: 'Visual' })
    expect(typeof put.body.data.created).toBe('boolean')
    const me = await send('get', '/api/v1/vark-results/me', player)
    expect(Object.keys(me.body.data).sort()).toEqual(['auditoryScore', 'dominantStyle', 'id', 'readingScore', 'userId', 'visualScore'])
  })

  it('rechaza respuestas fuera de A, B o C y exige sesión', async () => {
    expect((await send('put', '/api/v1/vark-results/me', player, { answers: { q1: 'Z' } })).body.error.code).toBe('VALIDATION_ERROR')
    expect((await send('put', '/api/v1/vark-results/me', null, { answers: { q1: 'A' } })).status).toBe(401)
  })

  it('el personal lista los resultados con su jugador, paginados y filtrables', async () => {
    const res = await send('get', '/api/v1/vark-results?style=Visual&limit=10', s.instructor)
    expect(res.status).toBe(200)
    expect(res.body.meta).toMatchObject({ page: 1, limit: 10 })
    expect(res.body.data.every((r) => r.dominantStyle === 'Visual')).toBe(true)
    expect(res.body.data[0]).toHaveProperty('user.firstName')
    expect((await send('get', '/api/v1/vark-results', player)).status).toBe(403)
    expect((await send('get', '/api/v1/vark-results?style=Otro', s.admin)).body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('API v1: usuarios', () => {
  it('lista paginada en camelCase, solo para el personal', async () => {
    expect((await send('get', '/api/v1/users', player)).status).toBe(403)
    const res = await send('get', '/api/v1/users?role=player&limit=3&sort=-createdAt', s.admin)
    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeLessThanOrEqual(3)
    expect(res.body.data[0]).toHaveProperty('firstName')
    expect(res.body.data[0]).not.toHaveProperty('first_name')
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i)
  })

  it('consulta un usuario y su historial; 404 o 400 según el id', async () => {
    const one = await send('get', `/api/v1/users/${player.id}`, s.instructor)
    expect(one.status).toBe(200)
    expect(one.body.data).toMatchObject({ id: player.id, role: 'player' })
    expect(new Date(one.body.data.createdAt).toISOString()).toBe(one.body.data.createdAt)
    const sessions = await send('get', `/api/v1/users/${player.id}/sessions`, s.admin)
    expect([sessions.status, Array.isArray(sessions.body.data)]).toEqual([200, true])
    expect((await send('get', '/api/v1/users/00000000-0000-4000-8000-000000000000', s.admin)).status).toBe(404)
    expect((await send('get', '/api/v1/users/xyz', s.admin)).body.error.code).toBe('VALIDATION_ERROR')
  })

  it('crear: solo admin, 201 con Location, cédula repetida es 409', async () => {
    const body = { cedula: '9100200301', firstName: 'Prueba', lastName: 'Versión Uno', role: 'player', age: 30 }
    expect((await send('post', '/api/v1/users', s.instructor, body)).status).toBe(403)
    const created = await send('post', '/api/v1/users', s.admin, body)
    expect(created.status).toBe(201)
    expect(created.headers.location).toBe(`/api/v1/users/${created.body.data.id}`)
    expect(created.body.data).toMatchObject({ emailSent: false, welcome: 'player' })
    expect((await send('post', '/api/v1/users', s.admin, body)).status).toBe(409)
    expect((await send('post', '/api/v1/users', s.admin, { firstName: 'Sin cédula' })).body.error.code).toBe('VALIDATION_ERROR')
  })

  it('un jugador edita lo suyo pero no puede cambiarse el rol', async () => {
    const res = await send('patch', `/api/v1/users/${player.id}`, player, { firstName: 'Renombrado', role: 'admin' })
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ firstName: 'Renombrado', role: 'player' })
    expect((await send('patch', `/api/v1/users/${s.players[1].id}`, player, { firstName: 'Ajeno' })).status).toBe(403)
  })

  it('habilitar y deshabilitar es solo de admin', async () => {
    const url = `/api/v1/users/${s.players[1].id}/active`
    expect((await send('put', url, s.instructor, { isActive: false })).status).toBe(403)
    expect((await send('put', url, s.admin, { isActive: false })).body.data).toEqual({ id: s.players[1].id, isActive: false })
    expect((await send('put', url, s.admin, { isActive: true })).body.data.isActive).toBe(true)
  })
})
