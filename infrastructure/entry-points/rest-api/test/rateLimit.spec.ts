import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import type { AuthenticatedUser } from '@earthcation/model'
import { rateLimiters, type RateLimitDeps, type WindowCounter } from '../src'

const LIMITS = { userMax: 3, ipMax: 2, authMax: 100, loginCedulaMax: 2, loginIpFailMax: 2 }

// Token de prueba: "Bearer u-<id>" es válido para el usuario <id>; cualquier otro, inválido
const tokens = {
  verify: (token: string): AuthenticatedUser => {
    if (!token.startsWith('u-')) throw new Error('token inválido')
    return { id: token.slice(2), role: 'player', username: null }
  },
}

const deps = (extra: Partial<RateLimitDeps> = {}): RateLimitDeps => ({
  limits: LIMITS, tokens, clientIp: (req) => req.ip, cedulaExists: (c) => Promise.resolve(c === '1001'), ...extra,
})

const appWith = (d: RateLimitDeps) => {
  const limiters = rateLimiters(d)
  const app = express()
  app.use(express.json())
  app.use('/api', limiters.global)
  // El login "falla" (401) salvo con la cédula 1001
  app.post('/api/auth/login', limiters.loginIpFail, limiters.loginCedula, (req, res) => {
    res.status((req.body as { cedula?: string }).cedula === '1001' ? 200 : 401).json({})
  })
  app.get('/api/x', (_req, res) => { res.json({}) })
  return app
}

const statuses = async (times: number, call: () => request.Test): Promise<number[]> => {
  const out: number[] = []
  for (let i = 0; i < times; i++) out.push((await call()).status)
  return out
}

describe('rateLimiters', () => {
  it('global: con token cuenta por usuario y sin token por IP, con máximos distintos', async () => {
    const app = appWith(deps())
    expect(await statuses(3, () => request(app).get('/api/x'))).toEqual([200, 200, 429])
    expect(await statuses(4, () => request(app).get('/api/x').set('Authorization', 'Bearer u-a'))).toEqual([200, 200, 200, 429])
    // Otro usuario desde la misma IP tiene su propio contador
    expect((await request(app).get('/api/x').set('Authorization', 'Bearer u-b')).status).toBe(200)
  })

  it('login: los fallos con cédulas no registradas bloquean la IP, los de una registrada no', async () => {
    const app = appWith(deps({ limits: { ...LIMITS, userMax: 100, ipMax: 100, loginCedulaMax: 100 } }))
    const login = (cedula: string) => () => request(app).post('/api/auth/login').send({ cedula })
    expect(await statuses(2, login('1001'))).toEqual([200, 200])
    expect(await statuses(3, login('999'))).toEqual([401, 401, 429])
  })

  it('login: varios fallos con una misma cédula la bloquean', async () => {
    const app = appWith(deps({ limits: { ...LIMITS, userMax: 100, ipMax: 100, loginIpFailMax: 100 } }))
    const login = (cedula: string) => () => request(app).post('/api/auth/login').send({ cedula })
    expect(await statuses(3, login('555'))).toEqual([401, 401, 429])
    expect((await login('556')()).status).toBe(401)
  })

  it('usa los contadores compartidos cuando los hay, con un prefijo por limitador', async () => {
    const hits = new Map<string, number>()
    const counter = (prefix: string): WindowCounter => ({
      hit: (key) => {
        hits.set(prefix + key, (hits.get(prefix + key) ?? 0) + 1)
        return Promise.resolve({ hits: hits.get(prefix + key) ?? 0, resetAt: new Date(Date.now() + 60_000) })
      },
      decrement: () => Promise.resolve(),
      reset: () => Promise.resolve(),
    })
    const app = appWith(deps({ counters: counter }))
    await request(app).get('/api/x').set('Authorization', 'Bearer u-a')
    expect([...hits.keys()]).toEqual(['rl:global:u:a'])
  })

  it('si el almacén de contadores falla, deja pasar', async () => {
    const broken: WindowCounter = {
      hit: () => Promise.reject(new Error('Redis caído')), decrement: () => Promise.resolve(), reset: () => Promise.resolve(),
    }
    const app = appWith(deps({ counters: () => broken }))
    expect(await statuses(5, () => request(app).get('/api/x'))).toEqual([200, 200, 200, 200, 200])
  })
})
