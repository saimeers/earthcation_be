import type { Cache } from '../../ports/cache'
import {
  NO_REDIS, toLoginEvent, toVisit, UNIQUE_WINDOW_S, uniqueKey,
  type CacheProbe, type Health, type LoginRequest, type Probe, type VisitDraft, type VisitStats,
} from './domain'
import type { HealthProbes, Runtime, VisitRepository, VisitStatsReadModel } from './ports'

export type ObservabilityDeps = {
  readonly visits: VisitRepository
  readonly stats: VisitStatsReadModel
  readonly cache: Cache
  readonly probes: HealthProbes
  readonly runtime: Runtime
}

const DAY_MS = 86400000

const isUnique = (cache: Cache, v: VisitDraft): Promise<boolean> =>
  v.isBot ? Promise.resolve(false) : v.visitor === null ? Promise.resolve(true) : cache.setIfAbsent(uniqueKey(v.visitor), UNIQUE_WINDOW_S)

const ingest = (d: ObservabilityDeps) => async (body: Readonly<Record<string, unknown>>): Promise<void> => {
  const draft = toVisit(body)
  await d.visits.saveVisit({ ...draft, isUnique: await isUnique(d.cache, draft) })
}

// La clave de caché cambió con la forma del valor (camelCase): un valor viejo de v1 en Redis no se reusa
const stats = (d: ObservabilityDeps) => (days: number): Promise<VisitStats> =>
  d.cache.remember({ namespace: 'visit-stats', key: String(days), ttlSeconds: 60 }, async () => {
    const since = new Date(d.runtime.now() - days * DAY_MS)
    return { days, since: since.toISOString(), ...(await d.stats.aggregate(since)) }
  })

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

// Ping con latencia; un fallo es un dato (ok: false), no un error
const timed = (now: () => number) => (run: () => Promise<unknown>): Promise<Probe> => {
  const start = now()
  return Promise.resolve().then(run).then(
    () => ({ ok: true, ms: now() - start }),
    (e: unknown) => ({ ok: false, ms: now() - start, error: message(e) }))
}

const probeCache = (d: ObservabilityDeps): Promise<CacheProbe> => {
  const ping = d.probes.cachePing()
  return ping ? timed(d.runtime.now)(ping) : Promise.resolve(NO_REDIS)
}

/** Estado de BD y Redis (ping con latencia), pool de conexiones y, para el panel, métricas de 15 min. */
const health = (d: ObservabilityDeps) => async (withMetrics: boolean): Promise<Health> => {
  const [database, redis] = await Promise.all([timed(d.runtime.now)(d.probes.pingDatabase), probeCache(d)])
  return {
    status: database.ok ? 'ok' : 'degraded', version: d.runtime.version,
    uptimeS: d.runtime.uptimeS(), memoryMb: d.runtime.memoryMb(),
    database: { ...database, pool: d.probes.pool() }, redis,
    ...(withMetrics ? { metrics: d.probes.metrics() } : {}),
  }
}

export const makeObservability = (d: ObservabilityDeps) => ({
  ingest: ingest(d),
  // No bloquea el login: quien llama decide qué hacer si falla
  recordLogin: (r: LoginRequest): Promise<void> => d.visits.saveLogin(toLoginEvent(r)),
  stats: stats(d),
  health: health(d),
})

export type Observability = ReturnType<typeof makeObservability>
