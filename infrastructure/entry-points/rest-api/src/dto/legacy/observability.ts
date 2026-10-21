import type { Health, LoginStats, MetricsSnapshot, RouteMetrics, VisitStats, VisitTotals } from '@earthcation/model'

// Respuestas legacy de visitas y salud: la misma forma snake_case de siempre (el panel actual las consume)

const totalsLegacy = (t: VisitTotals) => ({ visits: t.visits, unique: t.unique, via_qr: t.viaQr, visitors: t.visitors, bots: t.bots })

const loginsLegacy = (l: LoginStats) => ({ by_role: l.byRole, per_day: l.perDay, regions: l.regions, devices: l.devices })

export const visitStatsLegacy = (s: VisitStats) => ({
  days: s.days, since: s.since, totals: totalsLegacy(s.totals), per_day: s.perDay,
  countries: s.countries, regions: s.regions, cities: s.cities, devices: s.devices, os: s.os, browsers: s.browsers,
  versions: s.versions, logins: loginsLegacy(s.logins),
})

const routeLegacy = (r: RouteMetrics) => ({ route: r.route, requests: r.requests, errors: r.errors, p50_ms: r.p50Ms, p95_ms: r.p95Ms })

const metricsLegacy = (m: MetricsSnapshot) => ({
  window_minutes: m.windowMinutes, requests: m.requests, errors: m.errors, p50_ms: m.p50Ms, p95_ms: m.p95Ms,
  per_minute: m.perMinute, routes: m.routes.map(routeLegacy),
})

/** Detalle para el panel (Salud del servicio). */
export const healthDetailsLegacy = (h: Health) => ({
  status: h.status, version: h.version, uptime_s: h.uptimeS, memory_mb: h.memoryMb, database: h.database, redis: h.redis,
  ...(h.metrics ? { metrics: metricsLegacy(h.metrics) } : {}),
})

/** Estado público mínimo (monitores externos y Railway). */
export const publicHealthLegacy = (h: Health) => ({ status: h.status, version: h.version, uptime_s: h.uptimeS })
