import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import type { AccountDirectory, AccountStatus, AuthenticatedUser } from '@earthcation/model'
import { authenticate, errorHandlerLegacy, requireRole } from '../src'

// El token dice quién era la cuenta al firmarlo; el directorio, quién es ahora
const tokens = { verify: (): AuthenticatedUser => ({ id: 'u1', role: 'admin', username: null }) }

const directory = (status: AccountStatus | null): AccountDirectory => ({ find: () => Promise.resolve(status) })

const appWith = (accounts?: AccountDirectory) => {
  const app = express()
  app.get('/yo', authenticate(tokens, { accounts }), (req, res) => { res.json(req.user) })
  app.get('/solo-admin', authenticate(tokens, { accounts }), requireRole('admin'), (_req, res) => { res.json({ ok: true }) })
  app.use(errorHandlerLegacy(() => undefined))
  return app
}

const get = (app: express.Express, path: string) => request(app).get(path).set('Authorization', 'Bearer x')

describe('authenticate con el estado vigente de la cuenta', () => {
  it('sin directorio confía en el token', async () => {
    expect((await get(appWith(), '/yo')).body).toEqual({ id: 'u1', role: 'admin', username: null })
  })

  it('una cuenta deshabilitada ya no entra aunque su token siga vigente', async () => {
    const res = await get(appWith(directory({ isActive: false, role: 'admin' })), '/yo')
    expect([res.status, res.body]).toEqual([403, { error: 'La cuenta está deshabilitada' }])
  })

  it('una cuenta que ya no existe es un token inválido', async () => {
    const res = await get(appWith(directory(null)), '/yo')
    expect([res.status, res.body]).toEqual([403, { error: 'Token inválido o expirado' }])
  })

  it('el rol sale de la cuenta, no del token: un admin degradado pierde el permiso', async () => {
    const app = appWith(directory({ isActive: true, role: 'player' }))
    expect((await get(app, '/yo')).body.role).toBe('player')
    expect((await get(app, '/solo-admin')).status).toBe(403)
    expect((await get(appWith(directory({ isActive: true, role: 'admin' })), '/solo-admin')).status).toBe(200)
  })
})
