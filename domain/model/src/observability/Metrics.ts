// Métricas de las últimas 15 min por ruta (latencia p50/p95 y errores 5xx), para la página "Salud del
// servicio". Cubetas de 1 minuto: no crece con el tráfico ni necesita Redis (cada instancia mide lo suyo; con
// una sola instancia en Railway basta). Aquí solo el cálculo puro; las cubetas las guarda un MetricsStore.

export const METRICS_WINDOW_MINUTES = 15
const MAX_SAMPLES = 400 // por ruta y minuto, suficiente para un percentil razonable
const TOP_ROUTES = 25

export interface RouteSample { readonly durations: readonly number[]; readonly count: number; readonly errors: number }
/** Muestras de un minuto, por ruta ('GET /api/sessions/:id'). */
export type MinuteBucket = ReadonlyMap<string, RouteSample>
/** Cubetas por número de minuto (ms desde 1970 / 60000). */
export type Buckets = ReadonlyMap<number, MinuteBucket>

interface Latency { readonly p50Ms: number | null; readonly p95Ms: number | null }
export interface RouteMetrics extends Latency { readonly route: string; readonly requests: number; readonly errors: number }
export interface MinuteMetrics { readonly minute: string; readonly requests: number; readonly errors: number }
export interface MetricsSnapshot extends Latency {
  readonly windowMinutes: number
  readonly requests: number
  readonly errors: number
  readonly perMinute: readonly MinuteMetrics[]
  readonly routes: readonly RouteMetrics[]
}

const EMPTY: RouteSample = { durations: [], count: 0, errors: 0 }

/** Número de minuto de una fecha (la llave de las cubetas). */
export const minuteOf = (at: Date): number => Math.floor(at.getTime() / 60000)

/** La muestra con una petición más (las duraciones se guardan hasta un tope por minuto). */
export const recordSample = (sample: RouteSample | undefined, ms: number, failed: boolean): RouteSample => {
  const s = sample ?? EMPTY
  const durations = s.durations.length < MAX_SAMPLES ? [...s.durations, ms] : s.durations
  return { durations, count: s.count + 1, errors: s.errors + (failed ? 1 : 0) }
}

/** El minuto ya salió de la ventana. */
export const isStaleMinute = (minute: number, now: number): boolean => minute < now - METRICS_WINDOW_MINUTES

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

const slowest = (minutes: readonly MinuteBucket[]): RouteMetrics[] =>
  [...byRoute(minutes)].map(routeMetrics).toSorted((a, b) => (b.p95Ms ?? 0) - (a.p95Ms ?? 0)).slice(0, TOP_ROUTES)

/** Resumen de la ventana que termina en el minuto `now`: global y por ruta, las más lentas primero. */
export const summarizeMetrics = (buckets: Buckets, now: number): MetricsSnapshot => {
  const minutes = [...buckets].filter(([m]) => !isStaleMinute(m, now)).toSorted(([a], [b]) => a - b)
  const windowed = minutes.map(([, b]) => b)
  const all = total(windowed.flatMap((b) => [...b.values()]))
  return {
    windowMinutes: METRICS_WINDOW_MINUTES, requests: all.count, errors: all.errors, ...latency(all.durations),
    perMinute: minutes.map(minuteMetrics), routes: slowest(windowed),
  }
}
