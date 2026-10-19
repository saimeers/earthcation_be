import { parseUserAgent, type Agent } from './userAgent'
import type { MetricsSnapshot } from './metrics'

// Observabilidad: visitas al juego publicado (las reporta el Worker), ubicación de los inicios de sesión,
// estadísticas para el panel y salud del servicio.

type Fields = Readonly<Record<string, unknown>>

export type VisitDraft = Agent & {
  readonly visitor: string | null
  readonly versionId: string | null
  readonly sessionCode: string | null
  readonly country: string | null
  readonly region: string | null
  readonly city: string | null
  readonly colo: string | null
  readonly latitude: number | null
  readonly longitude: number | null
  readonly asn: number | null
  readonly asOrg: string | null
  readonly isBot: boolean
}
export type Visit = VisitDraft & { readonly isUnique: boolean }

export const text = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null

const numberOrNull = (v: unknown): number | null =>
  v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v)

// Cloudflare llama "Norte de Santander Department" a los departamentos de Colombia
const place = (v: unknown, max: number): string | null => text(v, max)?.replace(/\s+Department$/i, '') ?? null

// Escáneres y robots: user-agent declarado, o red de un centro de datos (llegan con UA de Chrome falso
// apenas se emite el certificado de un dominio nuevo). Se guardan marcados y no cuentan en el panel.
const BOT_UA = /bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|go-http|java\/|okhttp|axios|node-fetch|scan|facebookexternalhit|whatsapp|telegram|slack|discord/i
const DATACENTER = /amazon|aws|google|microsoft|azure|ovh|hetzner|digitalocean|linode|akamai|oracle|alibaba|tencent|contabo|vultr|choopa|leaseweb|m247|scaleway|hostinger|datacamp|cdn77|g-core|hosting|data ?center|server|cloud/i

export const isBot = (ua: unknown, asOrg: string | null): boolean =>
  typeof ua !== 'string' || ua === '' || BOT_UA.test(ua) || (asOrg !== null && DATACENTER.test(asOrg))

const matching = (v: unknown, pattern: RegExp): string | null => (typeof v === 'string' && pattern.test(v) ? v : null)

const whereFrom = (b: Fields) => ({
  country: text(b.country, 2), region: place(b.region, 80), city: text(b.city, 80), colo: text(b.colo, 8),
  latitude: numberOrNull(b.latitude), longitude: numberOrNull(b.longitude),
})

const networkOf = (b: Fields) => {
  const asOrg = text(b.as_organization, 120)
  return { asn: Number.isInteger(b.asn) ? (b.asn as number) : null, asOrg, isBot: isBot(b.user_agent, asOrg) }
}

/** Visita que reporta el Worker al servir el index de la versión en línea. */
export const toVisit = (b: Fields): VisitDraft => ({
  visitor: text(b.visitor, 64),
  versionId: matching(b.version_id, /^[0-9a-f-]{36}$/i),
  sessionCode: matching(b.session_code, /^\d{3}$/),
  ...whereFrom(b),
  ...networkOf(b),
  ...parseUserAgent(b.user_agent),
})

// Recargar o volver a abrir en menos de 30 min no es otra visita única
export const UNIQUE_WINDOW_S = 1800
export const uniqueKey = (visitor: string): string => `visit:${visitor}`

// ── Inicios de sesión ─────────────────────────────────────────────────────────

export type LoginEvent = Agent & {
  readonly userId: string
  readonly role: string
  readonly country: string | null
  readonly region: string | null
  readonly city: string | null
}
export type LoginRequest = { readonly userId: string; readonly role: string; readonly headers: Fields; readonly trusted: boolean }

// Node lee los headers como latin1 y Cloudflare manda cf-ipcity/cf-region en UTF-8 ("CÃºcuta")
export const utf8Header = (v: unknown): unknown => {
  if (typeof v !== 'string' || !/[À-ÿ]/.test(v)) return v
  const fixed = Buffer.from(v, 'latin1').toString('utf8')
  return fixed.includes('�') ? v : fixed
}

const knownCountry = (c: string | null) => (c === 'XX' || c === 'T1' ? null : c)

const NOWHERE = { country: null, region: null, city: null }

// Los headers cf-* solo se creen si la petición llegó por Cloudflare (trusted)
export const loginPlace = (h: Fields, trusted: boolean) => trusted
  ? { country: knownCountry(text(utf8Header(h['cf-ipcountry']), 2)), region: place(utf8Header(h['cf-region']), 80), city: text(utf8Header(h['cf-ipcity']), 80) }
  : NOWHERE

export const toLoginEvent = (r: LoginRequest): LoginEvent =>
  ({ userId: r.userId, role: r.role, ...loginPlace(r.headers, r.trusted), ...parseUserAgent(r.headers['user-agent']) })

// ── Estadísticas para el panel (Visitas) ──────────────────────────────────────

const WINDOWS: readonly number[] = [7, 30, 90]
export const toWindowDays = (v: unknown): number => (WINDOWS.includes(Number(v)) ? Number(v) : 30)

export type Count = { readonly key: string; readonly count: number }
export type PlaceCount = { readonly country: string; readonly region: string; readonly count: number }
export type CityCount = PlaceCount & { readonly city: string; readonly lat: number | null; readonly lng: number | null }
export type VersionCount = { readonly id: string; readonly label: string; readonly count: number }

export type VisitTotals = {
  readonly visits: number; readonly unique: number; readonly viaQr: number; readonly visitors: number
  readonly bots: number // escáneres/robots descartados
}
export type LoginStats = {
  readonly byRole: readonly { readonly role: string; readonly count: number; readonly users: number }[]
  readonly perDay: readonly { readonly day: string; readonly count: number }[]
  readonly regions: readonly PlaceCount[]
  readonly devices: readonly Count[]
}
export type VisitAggregates = {
  readonly totals: VisitTotals
  readonly perDay: readonly { readonly day: string; readonly visits: number; readonly unique: number }[]
  readonly countries: readonly Count[]
  readonly regions: readonly PlaceCount[]
  readonly cities: readonly CityCount[]
  readonly devices: readonly Count[]
  readonly os: readonly Count[]
  readonly browsers: readonly Count[]
  readonly versions: readonly VersionCount[]
  readonly logins: LoginStats
}
export type VisitStats = VisitAggregates & { readonly days: number; readonly since: string }

export const labelVersions = (counts: readonly Count[], labels: ReadonlyMap<string, string>): readonly VersionCount[] =>
  counts.map((c) => ({ id: c.key, label: labels.get(c.key) ?? 'Borrada', count: c.count }))

// ── Salud del servicio ────────────────────────────────────────────────────────

export type Probe = { readonly ok: boolean; readonly ms: number; readonly error?: string }
export type PoolState = {
  readonly size: number; readonly available: number; readonly using: number; readonly waiting: number; readonly max: number
}
export type CacheProbe = Probe | { readonly ok: null; readonly mode: string }
export const NO_REDIS: CacheProbe = { ok: null, mode: 'memoria (sin REDIS_URL)' }

export type Health = {
  readonly status: 'ok' | 'degraded'
  readonly version: string
  readonly uptimeS: number
  readonly memoryMb: number
  readonly database: Probe & { readonly pool: PoolState | null }
  readonly redis: CacheProbe
  readonly metrics?: MetricsSnapshot
}
