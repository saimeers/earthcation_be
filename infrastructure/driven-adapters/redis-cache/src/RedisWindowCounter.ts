import type { Redis } from 'ioredis'

export interface WindowHits {
  readonly hits: number
  readonly resetAt: Date
}

type MultiResults = [error: Error | null, value: unknown][] | null

// Los valores de un MULTI; si alguna orden falló, lanza su error
const valuesOf = (results: MultiResults): unknown[] => {
  const failed = results?.find(([error]) => error !== null)?.[0]
  if (failed) throw failed
  return (results ?? []).map(([, value]) => value)
}

/**
 * Contadores por ventana fija en Redis (los usa el límite de peticiones de la API): sobreviven a los despliegues y
 * se comparten si la API corre en varias instancias. Los errores de Redis se propagan; quien lo usa decide dejar
 * pasar la petición en vez de tumbar la API.
 */
export class RedisWindowCounter {
  constructor(private readonly client: Redis, private readonly prefix: string) {}

  /** Suma un golpe a `key`; la ventana empieza con el primero (SET NX con vencimiento) y las tres órdenes son atómicas. */
  async hit(key: string, windowMs: number): Promise<WindowHits> {
    const k = this.prefix + key
    const [, hits, ttl] = valuesOf(await this.client.multi().set(k, 0, 'PX', windowMs, 'NX').incr(k).pttl(k).exec())
    return { hits: Number(hits), resetAt: new Date(Date.now() + (Number(ttl) > 0 ? Number(ttl) : windowMs)) }
  }

  async decrement(key: string): Promise<void> {
    await this.client.decr(this.prefix + key)
  }

  async reset(key: string): Promise<void> {
    await this.client.del(this.prefix + key)
  }
}
