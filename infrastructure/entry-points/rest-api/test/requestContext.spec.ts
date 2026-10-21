import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import type { AuditActor, AuditOrigin, IpHasher, RequestContext, RequestScope } from '@earthcation/model'
import { authenticate, requestContext } from '../src'

// Un RequestContext mínimo con la semántica del real: lo que se pone dentro de la petición lo ve lo que corre después
class Scope implements RequestContext {
  private store: { origin: AuditOrigin | null, actor: AuditActor | null } | null = null

  run<T>(origin: AuditOrigin | null, work: () => T): T { this.store = { origin, actor: null }; return work() }
  setActor(actor: AuditActor): void { if (this.store) this.store.actor = actor }
  current(): RequestScope | null { return this.store }
}

const ips: IpHasher = { hash: (ip) => (ip ? `h(${ip})` : null) }
const tokens = { verify: () => ({ id: 'u1', role: 'admin' as const, username: null }) }

describe('requestContext y authenticate', () => {
  it('guarda el origen (huella de la IP y navegador) y, tras autenticar, el actor', async () => {
    const scope = new Scope()
    const app = express()
    app.use(requestContext(scope, ips, () => '10.0.0.9'))
    app.get('/quien', authenticate(tokens, (user) => { scope.setActor({ id: user.id, role: user.role }) }), (_req, res) => { res.json(scope.current()) })
    const res = await request(app).get('/quien').set('Authorization', 'Bearer x').set('User-Agent', 'pruebas/1.0')
    expect(res.body).toEqual({ origin: { ipHash: 'h(10.0.0.9)', userAgent: 'pruebas/1.0' }, actor: { id: 'u1', role: 'admin' } })
  })

  it('sin navegador ni IP el origen queda en nulos, y un navegador larguísimo se recorta', async () => {
    const scope = new Scope()
    const app = express()
    app.use(requestContext(scope, ips, () => undefined))
    app.get('/x', (_req, res) => { res.json(scope.current()) })
    const res = await request(app).get('/x').set('User-Agent', 'a'.repeat(500))
    expect(res.body.origin.ipHash).toBeNull()
    expect(res.body.origin.userAgent).toHaveLength(300)
  })
})
