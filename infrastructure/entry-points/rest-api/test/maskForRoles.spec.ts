import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { authenticate, maskForRoles } from '../src'

const row = { id: 'u1', cedula: '1234567890', first_name: 'Ana', email: 'ana@mina.co', age: 41, role: 'player' }
const asRole = (role: 'admin' | 'developer') => ({ verify: () => ({ id: 'x', role, username: null }) })

const appFor = (role: 'admin' | 'developer', masked: readonly string[]) => {
  const app = express()
  app.use(maskForRoles(masked))
  app.get('/datos', authenticate(asRole(role)), (_req, res) => { res.json([row]) })
  app.get('/publico', (_req, res) => { res.json(row) })
  return app
}

const get = (app: express.Express, path: string) => request(app).get(path).set('Authorization', 'Bearer x')

describe('maskForRoles', () => {
  it('enmascara las respuestas JSON del rol indicado y no las de los demás', async () => {
    const masked = (await get(appFor('developer', ['developer']), '/datos')).body as typeof row[]
    expect(masked[0]).toEqual({ id: 'u1', cedula: '***890', first_name: 'A.', email: '***@mina.co', age: null, role: 'player' })
    expect((await get(appFor('admin', ['developer']), '/datos')).body).toEqual([row])
  })

  it('sin sesión no enmascara (p. ej. el login devuelve la cuenta de quien acaba de entrar)', async () => {
    expect((await request(appFor('developer', ['developer'])).get('/publico')).body).toEqual(row)
  })
})
