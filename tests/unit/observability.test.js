import { describe, it, expect } from 'vitest'
import { parseUserAgent } from '../../src/contexts/observability/userAgent'
import { isBot, loginPlace, toVisit, toWindowDays, labelVersions } from '../../src/contexts/observability/domain'
import { record, summarize, percentile } from '../../src/contexts/observability/metrics'
import { makeObservability } from '../../src/contexts/observability/application'

const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36'
const EDGE_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 Edg/128.0'

describe('user-agent', () => {
  it('dispositivo, sistema y navegador', () => {
    expect(parseUserAgent(CHROME_ANDROID)).toEqual({ device: 'mobile', os: 'Android', browser: 'Chrome' })
    expect(parseUserAgent(EDGE_WINDOWS)).toEqual({ device: 'desktop', os: 'Windows', browser: 'Edge' })
    expect(parseUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0) Safari/604.1')).toEqual({ device: 'tablet', os: 'iOS', browser: 'Safari' })
    expect(parseUserAgent('algo raro')).toEqual({ device: 'desktop', os: 'Otro', browser: 'Otro' })
  })
  it('sin user-agent no se adivina nada', () => {
    expect(parseUserAgent(undefined)).toEqual({ device: null, os: null, browser: null })
  })
})

describe('visitas', () => {
  it('robots por user-agent o por red de centro de datos', () => {
    expect(isBot('curl/8.0', null)).toBe(true)
    expect(isBot(undefined, null)).toBe(true)
    expect(isBot(CHROME_ANDROID, 'Hetzner Online GmbH')).toBe(true)
    expect(isBot(CHROME_ANDROID, 'Media Commerce Partners')).toBe(false)
  })

  it('normaliza lo que manda el Worker', () => {
    const v = toVisit({
      visitor: '  abc  ', version_id: 'no-es-uuid', session_code: '1234', country: 'COL', region: 'Norte de Santander Department',
      latitude: '7.5', longitude: '', asn: 1.5, user_agent: CHROME_ANDROID,
    })
    expect(v).toMatchObject({
      visitor: 'abc', versionId: null, sessionCode: null, country: 'CO', region: 'Norte de Santander',
      latitude: 7.5, longitude: null, asn: null, isBot: false, device: 'mobile',
    })
  })

  it('ventana de días del panel', () => {
    expect([toWindowDays('7'), toWindowDays(90), toWindowDays('15'), toWindowDays(undefined)]).toEqual([7, 90, 30, 30])
  })

  it('versiones borradas', () => {
    expect(labelVersions([{ key: 'a', count: 2 }, { key: 'b', count: 1 }], new Map([['a', 'v1.0']])))
      .toEqual([{ id: 'a', label: 'v1.0', count: 2 }, { id: 'b', label: 'Borrada', count: 1 }])
  })
})

describe('ubicación del login', () => {
  it('corrige el UTF-8 que Node lee como latin1 y descarta países desconocidos', () => {
    const headers = { 'cf-ipcountry': 'XX', 'cf-region': 'Norte de Santander Department', 'cf-ipcity': Buffer.from('Cúcuta').toString('latin1') }
    expect(loginPlace(headers, true)).toEqual({ country: null, region: 'Norte de Santander', city: 'Cúcuta' })
  })
  it('sin Cloudflare no se cree ningún header cf-*', () => {
    expect(loginPlace({ 'cf-ipcountry': 'CO' }, false)).toEqual({ country: null, region: null, city: null })
  })
})

describe('métricas', () => {
  const minute = (routes) => new Map(Object.entries(routes))
  const sample = (...durations) => durations.reduce((s, ms) => record(s, ms, ms >= 1000), undefined)

  it('percentiles y errores por ruta, más lentas primero', () => {
    const buckets = new Map([
      [100, minute({ 'GET /a': sample(10, 20, 30), 'GET /b': sample(1500) })],
      [101, minute({ 'GET /a': sample(40) })],
    ])
    const m = summarize(buckets, 101)
    expect(m).toMatchObject({ windowMinutes: 15, requests: 5, errors: 1, p50Ms: 30, p95Ms: 1500 })
    expect(m.perMinute.map((x) => x.requests)).toEqual([4, 1])
    expect(m.routes.map((r) => [r.route, r.requests, r.p95Ms])).toEqual([['GET /b', 1, 1500], ['GET /a', 4, 40]])
  })

  it('ignora minutos fuera de la ventana', () => {
    expect(summarize(new Map([[1, minute({ 'GET /a': sample(5) })]]), 100)).toMatchObject({ requests: 0, p50Ms: null })
  })

  it('percentil de lista vacía', () => expect(percentile([], 0.5)).toBeNull())
})

describe('casos de uso de observabilidad', () => {
  const saved = []
  const seen = new Set()
  const deps = (overrides = {}) => ({
    visits: { saveVisit: async (v) => { saved.push(v) }, saveLogin: async () => {} },
    stats: { aggregate: async () => ({}) },
    cache: {
      remember: async (_e, compute) => JSON.parse(JSON.stringify(await compute())),
      setIfAbsent: async (key) => (seen.has(key) ? false : (seen.add(key), true)),
    },
    probes: { pingDatabase: async () => {}, cachePing: () => null, pool: () => null, metrics: () => ({ requests: 0 }) },
    runtime: { version: '1.0.0', now: () => 0, uptimeS: () => 5, memoryMb: () => 64 },
    ...overrides,
  })

  it('la segunda visita del mismo visitante no es única y un robot nunca lo es', async () => {
    const o = makeObservability(deps())
    await o.ingest({ visitor: 'v1', user_agent: CHROME_ANDROID })
    await o.ingest({ visitor: 'v1', user_agent: CHROME_ANDROID })
    await o.ingest({ visitor: 'v2', user_agent: 'curl/8' })
    expect(saved.map((v) => v.isUnique)).toEqual([true, false, false])
  })

  it('salud degradada si la BD no responde, con el motivo', async () => {
    const o = makeObservability(deps({
      probes: { pingDatabase: async () => { throw new Error('sin conexión') }, cachePing: () => null, pool: () => null, metrics: () => ({}) },
    }))
    const h = await o.health(false)
    expect(h).toMatchObject({ status: 'degraded', database: { ok: false, error: 'sin conexión' }, redis: { ok: null } })
    expect(h).not.toHaveProperty('metrics')
  })

  it('estadísticas con la ventana pedida', async () => {
    const o = makeObservability(deps({ runtime: { version: '1', now: () => 7 * 86400000, uptimeS: () => 0, memoryMb: () => 0 } }))
    expect(await o.stats(7)).toEqual({ days: 7, since: '1970-01-01T00:00:00.000Z' })
  })
})
