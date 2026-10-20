import { describe, expect, it } from 'vitest'
import { InMemoryMetricsStore } from '../src'

describe('InMemoryMetricsStore', () => {
  it('suma por minuto y ruta, y suelta los minutos fuera de la ventana', () => {
    const clock = { ms: 0, now() { return new Date(this.ms) } }
    const store = new InMemoryMetricsStore(clock)
    store.record('GET /a', 10, false)
    store.record('GET /a', 20, true)
    expect(store.buckets().get(0)?.get('GET /a')).toEqual({ durations: [10, 20], count: 2, errors: 1 })
    clock.ms = 20 * 60000
    store.record('GET /b', 5, false)
    expect([...store.buckets().keys()]).toEqual([20])
  })
})
