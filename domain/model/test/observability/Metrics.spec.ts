import { describe, expect, it } from 'vitest'
import { minuteOf, percentile, recordSample, summarizeMetrics, type RouteSample } from '../../src'

const minute = (routes: Record<string, RouteSample>) => new Map(Object.entries(routes))
const sample = (...durations: number[]) =>
  durations.reduce<RouteSample | undefined>((s, ms) => recordSample(s, ms, ms >= 1000), undefined) as RouteSample

describe('métricas por ruta', () => {
  it('percentiles y errores por ruta, más lentas primero', () => {
    const buckets = new Map([
      [100, minute({ 'GET /a': sample(10, 20, 30), 'GET /b': sample(1500) })],
      [101, minute({ 'GET /a': sample(40) })],
    ])
    const m = summarizeMetrics(buckets, 101)
    expect(m).toMatchObject({ windowMinutes: 15, requests: 5, errors: 1, p50Ms: 30, p95Ms: 1500 })
    expect(m.perMinute.map((x) => x.requests)).toEqual([4, 1])
    expect(m.perMinute[0]?.minute).toBe(new Date(100 * 60000).toISOString())
    expect(m.routes.map((r) => [r.route, r.requests, r.p95Ms])).toEqual([['GET /b', 1, 1500], ['GET /a', 4, 40]])
  })

  it('ignora minutos fuera de la ventana', () => {
    expect(summarizeMetrics(new Map([[1, minute({ 'GET /a': sample(5) })]]), 100)).toMatchObject({ requests: 0, p50Ms: null })
  })

  it('percentil de lista vacía', () => { expect(percentile([], 0.5)).toBeNull() })

  it('minuto de una fecha', () => { expect(minuteOf(new Date(120000 + 59999))).toBe(2) })
})
