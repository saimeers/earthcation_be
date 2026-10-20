import type { Cache, CacheEntry, CacheHealthProbe } from '@earthcation/model'
import type { Redis } from 'ioredis'
import { MemoryStore } from './MemoryStore'

const VERSION_TTL_SECONDS = 7 * 24 * 3600

const toJson = (value: unknown): string =>
  JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))

/**
 * Caché de lecturas en Redis cuando hay, en memoria si no (o si Redis falla: sin caché esa vez, nunca un error).
 * Las claves viven en namespaces con número de versión: `bump` lo incrementa y deja inalcanzables de una vez
 * todas las claves viejas (vencen solas), sin recorrer claves. Los valores se guardan como JSON, así cada quien
 * recibe una copia que puede cambiar sin tocar la caché.
 */
export class RedisCache implements Cache, CacheHealthProbe {
  private readonly memory: MemoryStore

  constructor(private readonly redis: Redis | null, nowMs?: () => number) {
    this.memory = new MemoryStore(nowMs)
  }

  get isShared(): boolean { return this.redis !== null }

  async ping(): Promise<void> {
    await this.redis?.ping()
  }

  async remember<T>(entry: CacheEntry, compute: () => Promise<T>): Promise<T> {
    const key = `cache:${entry.namespace}:v${await this.versionOf(entry.namespace)}:${entry.key}`
    const cached = await this.get(key)
    if (cached !== null) return JSON.parse(cached) as T
    const json = toJson(await compute())
    await this.set(key, json, entry.ttlSeconds)
    return JSON.parse(json) as T
  }

  async setIfAbsent(key: string, ttlSeconds: number): Promise<boolean> {
    if (!this.redis) return this.memorySetIfAbsent(key, ttlSeconds)
    try {
      return (await this.redis.set(key, '1', 'EX', ttlSeconds, 'NX')) === 'OK'
    } catch {
      return true
    }
  }

  async bump(namespace: string): Promise<void> {
    const key = `cachever:${namespace}`
    if (!this.redis) {
      this.memory.set(key, String(Number(this.memory.get(key) ?? 0) + 1), VERSION_TTL_SECONDS)
      return
    }
    try {
      await this.redis.multi().incr(key).expire(key, VERSION_TTL_SECONDS).exec()
    } catch { /* las entradas igual vencen solas */ }
  }

  private async versionOf(namespace: string): Promise<string> {
    return (await this.get(`cachever:${namespace}`)) ?? '0'
  }

  private async get(key: string): Promise<string | null> {
    if (!this.redis) return this.memory.get(key)
    try {
      return await this.redis.get(key)
    } catch {
      return null
    }
  }

  private async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (!this.redis) { this.memory.set(key, value, ttlSeconds); return }
    try {
      await this.redis.set(key, value, 'EX', ttlSeconds)
    } catch { /* sin caché esta vez */ }
  }

  private memorySetIfAbsent(key: string, ttlSeconds: number): boolean {
    if (this.memory.get(key) !== null) return false
    this.memory.set(key, '1', ttlSeconds)
    return true
  }
}
