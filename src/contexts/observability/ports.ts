import type { LoginEvent, PoolState, Visit, VisitAggregates } from './domain'
import type { MetricsSnapshot } from './metrics'

export type VisitRepository = {
  readonly saveVisit: (visit: Visit) => Promise<void>
  readonly saveLogin: (event: LoginEvent) => Promise<void>
}

// Agregaciones de Postgres sobre visitas e inicios de sesión desde `since`
export type VisitStatsReadModel = { readonly aggregate: (since: Date) => Promise<VisitAggregates> }

export type HealthProbes = {
  readonly pingDatabase: () => Promise<unknown>
  // null cuando no hay REDIS_URL (se decide en cada consulta, como el cliente de Redis)
  readonly cachePing: () => (() => Promise<unknown>) | null
  readonly pool: () => PoolState | null
  readonly metrics: () => MetricsSnapshot
}

export type Runtime = {
  readonly version: string
  readonly now: () => number
  readonly uptimeS: () => number
  readonly memoryMb: () => number
}
