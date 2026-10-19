// Caché de lecturas compartida por los contextos (Redis o memoria, ver services/cache.service.js).
// remember devuelve una copia JSON del valor: las fechas llegan como texto ISO.
export type CacheEntry = { readonly namespace: string; readonly key: string; readonly ttlSeconds: number }

export type Cache = {
  readonly remember: <T>(entry: CacheEntry, compute: () => Promise<T>) => Promise<T>
  // true si la clave no existía y quedó puesta ahora (si Redis falla, true)
  readonly setIfAbsent: (key: string, ttlSeconds: number) => Promise<boolean>
}
