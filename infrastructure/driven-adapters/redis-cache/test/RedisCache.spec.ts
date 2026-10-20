import { describe, expect, it } from 'vitest'
import { RedisCache } from '../src'

describe('RedisCache sin Redis (memoria)', () => {
  it('remember calcula una vez y devuelve copias JSON', async () => {
    const cache = new RedisCache(null)
    let calls = 0
    const compute = () => { calls += 1; return Promise.resolve({ at: new Date(0), n: 1 }) }
    const entry = { namespace: 'ns', key: 'k', ttlSeconds: 60 }
    const first = await cache.remember(entry, compute)
    const second = await cache.remember(entry, compute)
    expect([calls, first, second]).toEqual([1, { at: '1970-01-01T00:00:00.000Z', n: 1 }, first])
    expect(first).not.toBe(second)
  })

  it('bump invalida el namespace', async () => {
    const cache = new RedisCache(null)
    let n = 0
    const entry = { namespace: 'ns', key: 'k', ttlSeconds: 60 }
    await cache.remember(entry, () => Promise.resolve(++n))
    await cache.bump('ns')
    expect(await cache.remember(entry, () => Promise.resolve(++n))).toBe(2)
  })

  it('setIfAbsent respeta el vencimiento', async () => {
    let now = 0
    const cache = new RedisCache(null, () => now)
    expect([await cache.setIfAbsent('visit:a', 10), await cache.setIfAbsent('visit:a', 10)]).toEqual([true, false])
    now = 10_000
    expect(await cache.setIfAbsent('visit:a', 10)).toBe(true)
  })

  it('no es compartida y su ping no hace nada', async () => {
    const cache = new RedisCache(null)
    expect(cache.isShared).toBe(false)
    await expect(cache.ping()).resolves.toBeUndefined()
  })
})
