import type {
  Buckets, Cache, CacheEntry, CacheHealthProbe, Clock, DatabaseHealthProbe, LoginEvent, LoginEventRepository,
  MetricsStore, PoolState, RuntimeInfo, Visit, VisitAggregates, VisitRepository, VisitStatsReadModel,
} from '@earthcation/model'

/** Visitas e inicios de sesión guardados en memoria. */
export class InMemoryVisitRepository implements VisitRepository, LoginEventRepository {
  readonly visits: Visit[] = []
  readonly logins: LoginEvent[] = []

  save(item: Visit | LoginEvent) {
    if ('uniqueKey' in item) this.visits.push(item)
    else this.logins.push(item)
    return Promise.resolve()
  }
}

/** Caché en memoria con la misma semántica: copia JSON en remember, setIfAbsent con claves vistas. */
export class InMemoryCache implements Cache {
  readonly values = new Map<string, string>()
  readonly seen = new Set<string>()

  async remember<T>(entry: CacheEntry, compute: () => Promise<T>): Promise<T> {
    const key = `${entry.namespace}:${entry.key}`
    const hit = this.values.get(key) ?? JSON.stringify(await compute())
    this.values.set(key, hit)
    return JSON.parse(hit) as T
  }

  setIfAbsent(key: string) {
    const fresh = !this.seen.has(key)
    this.seen.add(key)
    return Promise.resolve(fresh)
  }

  bump() { this.values.clear(); return Promise.resolve() }
}

export class FixedClock implements Clock {
  constructor(public ms: number) {}
  now() { return new Date(this.ms) }
}

export class FakeStatsReadModel implements VisitStatsReadModel {
  readonly calls: Date[] = []
  aggregate(since: Date) {
    this.calls.push(since)
    return Promise.resolve({ totals: { visits: 1 } } as unknown as VisitAggregates)
  }
}

export class FakeDatabase implements DatabaseHealthProbe {
  constructor(private readonly failure?: Error, private readonly poolState: PoolState | null = null) {}
  ping() { return this.failure ? Promise.reject(this.failure) : Promise.resolve() }
  pool() { return this.poolState }
}

export class FakeCacheProbe implements CacheHealthProbe {
  constructor(readonly isShared: boolean) {}
  ping() { return Promise.resolve() }
}

export class FakeMetrics implements MetricsStore {
  readonly minutes = new Map<number, Map<string, { durations: number[]; count: number; errors: number }>>()
  record() { /* sin uso en estas pruebas */ }
  buckets(): Buckets { return this.minutes }
}

export const runtime: RuntimeInfo = { version: '1.0.0', uptimeSeconds: () => 5, memoryMb: () => 64 }
