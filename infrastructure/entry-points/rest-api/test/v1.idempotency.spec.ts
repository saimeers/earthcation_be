import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { AuthenticatedUser, ClaimResult, IdempotencyClaim, IdempotencyStore, StoredReply } from '@earthcation/model'
import { IdempotentExecutor } from '@earthcation/usecase'
import { authenticate, createIdempotencyGuard, createRouterV1 } from '../src'
import { created } from '../src/v1/http/reply'
import { route } from '../src/v1/http/route'

const tokens = { verify: (token: string): AuthenticatedUser => ({ id: `u-${token}`, role: 'player', username: null }) }

// Almacén mínimo en memoria: la clave es usuario + clave del cliente
class MemoryStore implements IdempotencyStore {
  readonly rows = new Map<string, { fingerprint: string, reply: StoredReply | null }>()
  claim(c: IdempotencyClaim): Promise<ClaimResult> {
    const row = this.rows.get(`${c.userId}|${c.key}`)
    if (!row) { this.rows.set(`${c.userId}|${c.key}`, { fingerprint: c.fingerprint, reply: null }); return Promise.resolve({ kind: 'new' }) }
    if (row.fingerprint !== c.fingerprint) return Promise.resolve({ kind: 'reused' })
    return Promise.resolve(row.reply ? { kind: 'replay', reply: row.reply } : { kind: 'in_progress' })
  }
  complete(c: IdempotencyClaim, reply: StoredReply) { const r = this.rows.get(`${c.userId}|${c.key}`); if (r) r.reply = reply; return Promise.resolve() }
  release(c: IdempotencyClaim) { this.rows.delete(`${c.userId}|${c.key}`); return Promise.resolve() }
  purgeExpired() { return Promise.resolve(0) }
}

const setup = () => {
  let created_ = 0
  const store = new MemoryStore()
  const app = express()
  app.use(express.json())
  app.use('/api/v1', createRouterV1({
    routes: [route({
      method: 'post', path: '/things', tag: 'Prueba', summary: 'Crea una cosa', roles: [], idempotent: true,
      body: z.object({ name: z.string(), size: z.number().optional() }),
      response: { status: 201, description: 'La cosa creada' },
      handler: ({ body }) => { created_ += 1; return Promise.resolve(created(`/api/v1/things/${created_}`, { id: created_, name: body.name })) },
    })],
    authenticate: authenticate(tokens), idempotency: createIdempotencyGuard(new IdempotentExecutor(store)), docsAccess: 'public',
    info: { title: 'Prueba', version: '1', description: 'x' }, log: () => undefined,
  }))
  const post = (body: object, who = 'a', key?: string) => {
    const req = request(app).post('/api/v1/things').set('Authorization', `Bearer ${who}`)
    return (key ? req.set('Idempotency-Key', key) : req).send(body)
  }
  return { app, post, count: () => created_ }
}

describe('Idempotency-Key en v1', () => {
  it('un reintento con la misma clave recibe la misma respuesta (201, Location) y no crea otra cosa', async () => {
    const t = setup()
    const first = await t.post({ name: 'x' }, 'a', 'clave-de-prueba-1')
    const retry = await t.post({ name: 'x' }, 'a', 'clave-de-prueba-1')
    expect([first.status, retry.status, retry.body, retry.headers.location]).toEqual([201, 201, first.body, '/api/v1/things/1'])
    expect([first.headers['idempotent-replayed'], retry.headers['idempotent-replayed']]).toEqual([undefined, 'true'])
    expect(t.count()).toBe(1)
  })

  it('el orden de los campos no cambia la petición', async () => {
    const t = setup()
    await t.post({ name: 'x', size: 1 }, 'a', 'clave-de-prueba-2')
    const retry = await t.post({ size: 1, name: 'x' }, 'a', 'clave-de-prueba-2')
    expect([retry.status, retry.headers['idempotent-replayed'], t.count()]).toEqual([201, 'true', 1])
  })

  it('sin cabecera todo funciona como siempre: cada petición crea', async () => {
    const t = setup()
    await t.post({ name: 'x' })
    await t.post({ name: 'x' })
    expect(t.count()).toBe(2)
  })

  it('la misma clave con otro cuerpo es 422 IDEMPOTENCY_KEY_REUSED; con otro usuario es independiente', async () => {
    const t = setup()
    await t.post({ name: 'x' }, 'a', 'clave-de-prueba-3')
    const reused = await t.post({ name: 'otro' }, 'a', 'clave-de-prueba-3')
    expect([reused.status, reused.body.error.code]).toEqual([422, 'IDEMPOTENCY_KEY_REUSED'])
    expect((await t.post({ name: 'x' }, 'b', 'clave-de-prueba-3')).status).toBe(201)
    expect(t.count()).toBe(2)
  })

  it('una clave mal formada es 400 y no ejecuta nada', async () => {
    const t = setup()
    const res = await t.post({ name: 'x' }, 'a', 'corta')
    expect([res.status, res.body.error.code, t.count()]).toEqual([400, 'IDEMPOTENCY_KEY_INVALID', 0])
  })

  it('un error de validación no gasta la clave: se corrige y se reintenta', async () => {
    const t = setup()
    expect((await t.post({}, 'a', 'clave-de-prueba-4')).status).toBe(400)
    expect((await t.post({ name: 'x' }, 'a', 'clave-de-prueba-4')).status).toBe(201)
  })

  it('el OpenAPI documenta la cabecera en la ruta idempotente', async () => {
    const doc = (await request(setup().app).get('/api/v1/openapi.json')).body as { paths: Record<string, Record<string, { parameters: { name: string, in: string, required: boolean }[] }>> }
    expect(doc.paths['/things'].post.parameters).toContainEqual(expect.objectContaining({ name: 'Idempotency-Key', in: 'header', required: false }))
  })
})
