import { Redis } from 'ioredis'

export type { Redis } from 'ioredis'

/**
 * Cliente de Redis cuando hay URL; si no, null y cada uso cae a memoria. Los comandos fallan rápido en vez de
 * hacer cola mientras Redis no responde, así la API sigue contestando (sin caché) si Redis se cae.
 */
const OPTIONS = {
  family: 0, // la red privada de Railway es IPv6
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  connectTimeout: 3000,
}

export const createRedisClient = (url: string | undefined, log: (message: string) => void): Redis | null => {
  if (!url) return null
  const client = new Redis(url, OPTIONS)
  warnOnce(client, log)
  return client
}

// Un aviso por caída, no uno por cada reintento
const warnOnce = (client: Redis, log: (message: string) => void): void => {
  const state = { warned: false }
  client.on('error', (e: Error) => {
    if (!state.warned) log(`Redis no disponible, se usa memoria: ${e.message}`)
    state.warned = true
  })
  client.on('ready', () => { state.warned = false })
}
