import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { cloudflareEdge, errorHandlerV1, isCloudflare } from '../src'
import { requireIngestSecret } from '../src/middlewares/ingestSecret'

describe('Cloudflare', () => {
  it('reconoce sus rangos IPv4/IPv6 (también IPv4 mapeada)', () => {
    expect([isCloudflare('104.16.0.1'), isCloudflare('::ffff:104.16.0.1'), isCloudflare('2606:4700::1')]).toEqual([true, true, true])
    expect([isCloudflare('8.8.8.8'), isCloudflare(undefined)]).toEqual([false, false])
  })

  it('cree CF-Connecting-IP solo con el secreto del borde', async () => {
    const edge = cloudflareEdge('borde')
    const app = express().get('/', (req, res) => { res.json({ ip: edge.clientIp(req), cf: edge.fromCloudflare(req) }) })
    const trusted = await request(app).get('/').set('cf-connecting-ip', '1.2.3.4').set('x-earthcation-edge', 'borde')
    const forged = await request(app).get('/').set('cf-connecting-ip', '1.2.3.4').set('x-earthcation-edge', 'otro')
    expect(trusted.body).toEqual({ ip: '1.2.3.4', cf: true })
    expect(forged.body).toMatchObject({ cf: false })
    expect(forged.body.ip).not.toBe('1.2.3.4')
  })
})

describe('secreto de ingesta', () => {
  const app = (secret: string | undefined) => express()
    .post('/ingest', requireIngestSecret(secret), (_req, res) => { res.status(204).end() })
    .use(errorHandlerV1(() => undefined))

  it('401 "No autorizado" sin el secreto correcto o sin secreto configurado', async () => {
    expect((await request(app('s')).post('/ingest').set('x-ingest-secret', 's')).status).toBe(204)
    const wrong = await request(app('s')).post('/ingest').set('x-ingest-secret', 'x')
    expect([wrong.status, wrong.body]).toEqual([401, { error: 'No autorizado' }])
    expect((await request(app(undefined)).post('/ingest').set('x-ingest-secret', '')).status).toBe(401)
  })
})
