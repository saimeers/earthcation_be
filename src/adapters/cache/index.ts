import { remember, setIfAbsent } from '../../services/cache.service'
import type { Cache } from '../../ports/cache'

// Adaptador del puerto Cache sobre el servicio de caché de v1 (Redis con respaldo en memoria)
export const cache: Cache = {
  remember: (entry, compute) => remember(entry.namespace, entry.key, entry.ttlSeconds, compute),
  setIfAbsent: (key, ttlSeconds) => setIfAbsent(key, ttlSeconds),
}
