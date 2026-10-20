import { describe, expect, it } from 'vitest'
import { GetHealthUseCase, GetVisitStatsUseCase, IngestVisitUseCase, RecordLoginUseCase } from '../../src'
import {
  FakeCacheProbe, FakeDatabase, FakeMetrics, FakeStatsReadModel, FixedClock, InMemoryCache, InMemoryVisitRepository, runtime,
} from '../fakes/InMemoryObservability'

const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36'

describe('ingesta de visitas', () => {
  it('la segunda visita del mismo visitante no es única y un robot nunca lo es', async () => {
    const visits = new InMemoryVisitRepository()
    const cache = new InMemoryCache()
    const ingest = new IngestVisitUseCase({ visits, cache })
    await ingest.execute({ fields: { visitor: 'v1', user_agent: CHROME_ANDROID } })
    await ingest.execute({ fields: { visitor: 'v1', user_agent: CHROME_ANDROID } })
    await ingest.execute({ fields: { visitor: 'v2', user_agent: 'curl/8' } })
    await ingest.execute({ fields: { user_agent: CHROME_ANDROID } })
    expect(visits.visits.map((v) => v.isUnique)).toEqual([true, false, false, true])
    expect([...cache.seen]).toEqual(['visit:v1'])
  })
})

describe('inicios de sesión', () => {
  it('guarda la ubicación solo si la petición vino de Cloudflare', async () => {
    const repo = new InMemoryVisitRepository()
    const record = new RecordLoginUseCase(repo)
    await record.execute({ userId: 'u1', role: 'admin', headers: { 'cf-ipcountry': 'CO' }, fromCloudflare: false })
    await record.execute({ userId: 'u1', role: 'admin', headers: { 'cf-ipcountry': 'CO' }, fromCloudflare: true })
    expect(repo.logins.map((e) => e.toProps().country)).toEqual([null, 'CO'])
  })
})

describe('estadísticas de visitas', () => {
  it('ventana pedida (30 por defecto) y en caché por ventana', async () => {
    const stats = new FakeStatsReadModel()
    const useCase = new GetVisitStatsUseCase({ stats, cache: new InMemoryCache(), clock: new FixedClock(7 * 86400000) })
    expect(await useCase.execute({ days: '7' })).toEqual({ days: 7, since: '1970-01-01T00:00:00.000Z', totals: { visits: 1 } })
    await useCase.execute({ days: 7 })
    expect((await useCase.execute({ days: 'x' })).days).toBe(30)
    expect(stats.calls).toHaveLength(2)
  })
})

describe('salud del servicio', () => {
  const health = (database: FakeDatabase, shared = false) => new GetHealthUseCase({
    database, cache: new FakeCacheProbe(shared), metrics: new FakeMetrics(), runtime, clock: new FixedClock(0),
  })

  it('degradada si la BD no responde, con el motivo y sin métricas', async () => {
    const h = await health(new FakeDatabase(new Error('sin conexión'))).execute({ withMetrics: false })
    expect(h).toMatchObject({ status: 'degraded', database: { ok: false, error: 'sin conexión', pool: null }, redis: { ok: null } })
    expect(h).not.toHaveProperty('metrics')
  })

  it('ok con Redis, pool y métricas para el panel', async () => {
    const pool = { size: 2, available: 1, using: 1, waiting: 0, max: 20 }
    const h = await health(new FakeDatabase(undefined, pool), true).execute({ withMetrics: true })
    expect(h).toMatchObject({ status: 'ok', version: '1.0.0', uptimeS: 5, memoryMb: 64, database: { ok: true, ms: 0, pool }, redis: { ok: true } })
    expect(h.metrics).toMatchObject({ windowMinutes: 15, requests: 0 })
  })
})
