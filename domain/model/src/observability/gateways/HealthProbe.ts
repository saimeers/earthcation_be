import type { PoolState } from '../Health'

/** Base de datos: ping y estado del pool de conexiones. */
export interface DatabaseHealthProbe {
  ping(): Promise<void>
  /** null si el pool todavía no existe. */
  pool(): PoolState | null
}

/** Caché compartida (Redis): si está configurada y su ping. */
export interface CacheHealthProbe {
  /** false cuando no hay Redis y la caché vive en memoria (no hay nada que sondear). */
  readonly isShared: boolean
  ping(): Promise<void>
}
