import {
  IN_MEMORY_CACHE, minuteOf, summarizeMetrics,
  type CacheHealthProbe, type CacheStatus, type Clock, type DatabaseHealthProbe, type Health, type MetricsStore,
  type Probe, type RuntimeInfo,
} from '@earthcation/model'
import type { GetHealthQuery } from './GetHealthQuery'

export interface GetHealthDeps {
  readonly database: DatabaseHealthProbe
  readonly cache: CacheHealthProbe
  readonly metrics: MetricsStore
  readonly runtime: RuntimeInfo
  readonly clock: Clock
}

const reason = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Estado de la BD y de Redis (ping con latencia), pool de conexiones y, para el panel, métricas de 15 min. */
export class GetHealthUseCase {
  constructor(private readonly deps: GetHealthDeps) {}

  async execute(query: GetHealthQuery): Promise<Health> {
    const { runtime, database } = this.deps
    const [db, redis] = await Promise.all([this.timed(() => database.ping()), this.probeCache()])
    return {
      status: db.ok ? 'ok' : 'degraded', version: runtime.version,
      uptimeS: runtime.uptimeSeconds(), memoryMb: runtime.memoryMb(),
      database: { ...db, pool: database.pool() }, redis,
      ...(query.withMetrics ? { metrics: this.metrics() } : {}),
    }
  }

  private probeCache(): Promise<CacheStatus> {
    const { cache } = this.deps
    return cache.isShared ? this.timed(() => cache.ping()) : Promise.resolve(IN_MEMORY_CACHE)
  }

  // Ping con latencia; un fallo es un dato (ok: false con el motivo), no un error
  private async timed(run: () => Promise<void>): Promise<Probe> {
    const start = this.nowMs()
    try {
      await run()
      return { ok: true, ms: this.nowMs() - start }
    } catch (e: unknown) {
      return { ok: false, ms: this.nowMs() - start, error: reason(e) }
    }
  }

  private metrics() {
    return summarizeMetrics(this.deps.metrics.buckets(), minuteOf(this.deps.clock.now()))
  }

  private nowMs(): number { return this.deps.clock.now().getTime() }
}
