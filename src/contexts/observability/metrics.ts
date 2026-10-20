// Métricas de las últimas 15 min por ruta (latencia p50/p95 y errores 5xx), para la página "Salud del
// servicio". Cubetas de 1 minuto: no crece con el tráfico ni necesita Redis (cada instancia mide lo suyo;
// con una sola instancia en Railway basta). Aquí solo las funciones puras; el estado vive en runtime.ts.

export const WINDOW_MIN = 15
const MAX_SAMPLES = 400 // por ruta y minuto, suficiente para un percentil razonable
const TOP_ROUTES = 25

export type RouteSample = { readonly durations: readonly number[]; readonly count: number; readonly errors: number }
export type MinuteBucket = ReadonlyMap<string, RouteSample>
export type Buckets = ReadonlyMap<number, MinuteBucket>

type Latency = { readonly p50Ms: number | null; readonly p95Ms: number | null }
export type RouteMetrics = Latency & { readonly route: string; readonly requests: number; readonly errors: number }
export type MinuteMetrics = { readonly minute: string; readonly requests: number; readonly errors: number }
export type MetricsSnapshot = Latency & {
  readonly windowMinutes: number
  readonly requests: number
  readonly errors: number
  readonly perMinute: readonly MinuteMetrics[]
  readonly routes: readonly RouteMetrics[]
}

const EMPTY: RouteSample = { durations: [], count: 0, errors: 0 }

export const record = (sample: RouteSample | undefined, ms: number, failed: boolean): RouteSample => {
  const s = sample ?? EMPTY
  const durations = s.durations.length < MAX_SAMPLES ? [...s.durations, ms] : s.durations
  return { durations, count: s.count + 1, errors: s.errors + (failed ? 1 : 0) }
}

export const isStale = (minute: number, now: number): boolean => minute < now - WINDOW_MIN

const merge = (a: RouteSample, b: RouteSample): RouteSample =>
  ({ durations: [...a.durations, ...b.durations], count: a.count + b.count, errors: a.errors + b.errors })

const total = (samples: readonly RouteSample[]): RouteSample => samples.reduce(merge, EMPTY)

export const percentile = (sorted: readonly number[], p: number): number | null =>
  sorted.length === 0 ? null : (sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? null)

const round = (v: number | null) => (v === null ? null : Math.round(v))

const latency = (durations: readonly number[]): Latency => {
  const sorted = durations.toSorted((a, b) => a - b)
  return { p50Ms: round(percentile(sorted, 0.5)), p95Ms: round(percentile(sorted, 0.95)) }
}

const minuteMetrics = ([minute, bucket]: readonly [number, MinuteBucket]): MinuteMetrics => {
  const t = total([...bucket.values()])
  return { minute: new Date(minute * 60000).toISOString(), requests: t.count, errors: t.errors }
}

// '/api/sessions/:id/progress' de todos los minutos sumado en una sola muestra por ruta
const byRoute = (minutes: readonly MinuteBucket[]): ReadonlyMap<string, RouteSample> =>
  minutes.flatMap((b) => [...b]).reduce<ReadonlyMap<string, RouteSample>>(
    (acc, [route, s]) => new Map([...acc, [route, merge(acc.get(route) ?? EMPTY, s)]]), new Map())

const routeMetrics = ([route, s]: readonly [string, RouteSample]): RouteMetrics =>
  ({ route, requests: s.count, errors: s.errors, ...latency(s.durations) })

const slowest = (minutes: readonly MinuteBucket[]): readonly RouteMetrics[] =>
  [...byRoute(minutes)].map(routeMetrics).toSorted((a, b) => (b.p95Ms ?? 0) - (a.p95Ms ?? 0)).slice(0, TOP_ROUTES)

/** Resumen de la ventana: global y por ruta, ordenado por más lentas. */
export const summarize = (buckets: Buckets, now: number): MetricsSnapshot => {
  const minutes = [...buckets].filter(([m]) => !isStale(m, now)).toSorted(([a], [b]) => a - b)
  const windowed = minutes.map(([, b]) => b)
  const all = total(windowed.flatMap((b) => [...b.values()]))
  return {
    windowMinutes: WINDOW_MIN, requests: all.count, errors: all.errors, ...latency(all.durations),
    perMinute: minutes.map(minuteMetrics), routes: slowest(windowed),
  }
}
