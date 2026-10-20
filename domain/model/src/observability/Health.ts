import type { MetricsSnapshot } from './Metrics'

// Salud del servicio: un fallo de la BD o de Redis es un dato (ok: false con el motivo), no un error.

export interface Probe { readonly ok: boolean; readonly ms: number; readonly error?: string }

export interface PoolState {
  readonly size: number
  readonly available: number
  readonly using: number
  readonly waiting: number
  readonly max: number
}

/** Ping a Redis, o el modo en memoria cuando no hay Redis configurado. */
export type CacheStatus = Probe | { readonly ok: null; readonly mode: string }

export const IN_MEMORY_CACHE: CacheStatus = { ok: null, mode: 'memoria (sin REDIS_URL)' }

export interface Health {
  readonly status: 'ok' | 'degraded'
  readonly version: string
  readonly uptimeS: number
  readonly memoryMb: number
  readonly database: Probe & { readonly pool: PoolState | null }
  readonly redis: CacheStatus
  /** Solo en el detalle para el panel. */
  readonly metrics?: MetricsSnapshot
}
