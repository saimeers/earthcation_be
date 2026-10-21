import { createRequire } from 'node:module'
import { describe, it, expect, inject } from 'vitest'

const require = createRequire(import.meta.url)
const { send } = require('../support/contract.cjs')
const { sequelize } = require('../../dist/container')

// Endurecimiento de la autenticación contra Postgres real: el token no sobrevive a la cuenta y el código de sala no se
// puede adivinar.
const s = inject('seed')

// Cuenta nueva: nadie la ha consultado, así que la caché de 60 s no la tiene y el cambio se nota de inmediato
const createPlayer = async (cedula) => {
  const created = await send('post', '/api/v1/users', s.admin, { cedula, firstName: 'Seguridad', lastName: 'Prueba', role: 'player' })
  return { id: created.body.data.id, cedula, role: 'player' }
}

describe('el token depende de la cuenta', () => {
  it('una cuenta deshabilitada ya no entra aunque su token siga vigente', async () => {
    const player = await createPlayer('9400500601')
    await send('put', `/api/v1/users/${player.id}/active`, s.admin, { isActive: false })
    const res = await send('get', '/api/v1/vark-results/me', player)
    expect([res.status, res.body.error.code]).toEqual([403, 'ACCOUNT_DISABLED'])
    const legacy = await send('get', '/api/vark/me', player)
    expect([legacy.status, legacy.body.error]).toEqual([403, 'La cuenta está deshabilitada'])
  })

  it('el rol sale de la cuenta y no del token: un token de admin de una cuenta que ya es jugador no pasa', async () => {
    const player = await createPlayer('9400500602')
    await sequelize.query("UPDATE users SET role = 'player' WHERE id = :id", { replacements: { id: player.id } })
    const asAdmin = { ...player, role: 'admin' }
    expect((await send('get', '/api/v1/users', asAdmin)).status).toBe(403)
  })

  it('una cuenta que ya no existe es un token inválido', async () => {
    const ghost = { id: '00000000-0000-4000-8000-0000000000aa', cedula: '1', role: 'admin' }
    const res = await send('get', '/api/v1/users', ghost)
    expect([res.status, res.body.error.code]).toEqual([403, 'TOKEN_INVALID'])
  })

  it('los tokens del personal vencen en 24 horas y los del jugador en 7 días', async () => {
    const jwt = require('jsonwebtoken')
    const lifetime = (token) => { const { exp, iat } = jwt.decode(token); return (exp - iat) / 3600 }
    const staff = await send('post', '/api/v1/auth/login', null, { cedula: s.admin.cedula, password: s.staffPassword })
    expect(lifetime(staff.body.data.token)).toBe(24)
    const player = await send('post', '/api/v1/auth/login', null, { cedula: s.players[0].cedula })
    expect(lifetime(player.body.data.token)).toBe(24 * 7)
  })
})

describe('el código de sala no se puede adivinar', () => {
  const guess = (who, code) => send('post', '/api/v1/sessions/join', who, { code })

  it('después de varios intentos con códigos distintos el jugador queda limitado, en v1 y en legacy', async () => {
    const player = await createPlayer('9400500603')
    const statuses = []
    for (let i = 0; i < 25; i++) statuses.push((await guess(player, String(100 + i))).status)
    expect(statuses.slice(0, 20).every((st) => st === 404)).toBe(true)
    expect(statuses.slice(20).every((st) => st === 429)).toBe(true)
    const limited = await guess(player, '999')
    expect(limited.body.error.code).toBe('RATE_LIMITED')
    const check = await send('get', '/api/v1/sessions/code/123', player)
    expect(check.status).toBe(429)
  })

  it('otro jugador no se ve afectado y un código bueno sigue funcionando para quien no ha agotado sus intentos', async () => {
    const other = await createPlayer('9400500604')
    expect((await guess(other, '000')).status).toBe(404)
    const room = (await send('post', '/api/v1/sessions', s.instructor, { name: 'Sala segura', locationId: s.location.id })).body.data
    expect((await guess(other, room.code)).status).toBe(200)
  })
})
