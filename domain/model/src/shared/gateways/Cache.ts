/** Cuánto vive un valor y en qué espacio de nombres (invalidable en bloque). */
export interface CacheEntry {
  readonly namespace: string
  readonly key: string
  readonly ttlSeconds: number
}

/**
 * Caché de lecturas compartida por los casos de uso (Redis o memoria). `remember` devuelve una copia JSON del
 * valor: las fechas llegan como texto ISO.
 */
export interface Cache {
  remember<T>(entry: CacheEntry, compute: () => Promise<T>): Promise<T>
  /** true si la clave no existía y quedó puesta ahora (si el almacén falla, true). */
  setIfAbsent(key: string, ttlSeconds: number): Promise<boolean>
  /** Invalida todo lo guardado en el namespace (las claves viejas vencen solas). */
  bump(namespace: string): Promise<void>
}
