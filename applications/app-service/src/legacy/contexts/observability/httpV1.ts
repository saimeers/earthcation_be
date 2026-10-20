import { timingSafeEqual } from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import auth from '../../middleware/auth.middleware'
import requireRole from '../../middleware/role.middleware'
import { fromCloudflare } from '../../utils/clientIp'
import { body } from '../../adapters/http/v1/respond'
import type { Observability } from './application'
import { toWindowDays, type Health, type LoginStats, type VisitStats, type VisitTotals } from './domain'
import type { MetricsSnapshot, RouteMetrics } from './metrics'

// Rutas v1 de visitas (/api/visits) y salud (/api/health), con las respuestas snake_case de siempre

const staff = [auth, requireRole('admin', 'developer')]

const totalsV1 = (t: VisitTotals) => ({ visits: t.visits, unique: t.unique, via_qr: t.viaQr, visitors: t.visitors, bots: t.bots })
const loginsV1 = (l: LoginStats) => ({ by_role: l.byRole, per_day: l.perDay, regions: l.regions, devices: l.devices })
const statsV1 = (s: VisitStats) => ({
  days: s.days, since: s.since, totals: totalsV1(s.totals), per_day: s.perDay,
  countries: s.countries, regions: s.regions, cities: s.cities, devices: s.devices, os: s.os, browsers: s.browsers,
  versions: s.versions, logins: loginsV1(s.logins),
})

const routeV1 = (r: RouteMetrics) => ({ route: r.route, requests: r.requests, errors: r.errors, p50_ms: r.p50Ms, p95_ms: r.p95Ms })
const metricsV1 = (m: MetricsSnapshot) => ({
  window_minutes: m.windowMinutes, requests: m.requests, errors: m.errors, p50_ms: m.p50Ms, p95_ms: m.p95Ms,
  per_minute: m.perMinute, routes: m.routes.map(routeV1),
})
const healthV1 = (h: Health) => ({
  status: h.status, version: h.version, uptime_s: h.uptimeS, memory_mb: h.memoryMb, database: h.database, redis: h.redis,
  ...(h.metrics ? { metrics: metricsV1(h.metrics) } : {}),
})

const sameSecret = (got: unknown, secret: string) => {
  const a = Buffer.from(typeof got === 'string' ? got : '')
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

// Sin token: lo protege x-ingest-secret (VISITS_INGEST_SECRET, compartido con el Worker)
const fromWorker = (req: Request, secret: string | undefined) =>
  secret !== undefined && secret !== '' && sameSecret(req.headers['x-ingest-secret'], secret)

export const visitsRouterV1 = (o: Observability, ingestSecret: () => string | undefined): Router => {
  const router = Router()
  router.post('/ingest', async (req: Request, res: Response) => {
    if (!fromWorker(req, ingestSecret())) { res.status(401).json({ error: 'No autorizado' }); return }
    await o.ingest(body(req.body))
    res.status(204).end()
  })
  router.get('/stats', ...staff, async (req: Request, res: Response) => { res.json(statsV1(await o.stats(toWindowDays(req.query.days)))) })
  return router
}

// Estado público mínimo (para monitores externos y Railway); el detalle va en /api/health/details
export const publicHealthV1 = (o: Observability) => async (_req: Request, res: Response): Promise<void> => {
  const h = await o.health(false)
  res.status(h.status === 'ok' ? 200 : 503).json({ status: h.status, version: h.version, uptime_s: h.uptimeS })
}

// Detalle para el panel (Salud del servicio): BD, Redis, pool y métricas de las últimas 15 min
export const healthRouterV1 = (o: Observability): Router =>
  Router().get('/details', ...staff, async (_req: Request, res: Response) => { res.json(healthV1(await o.health(true))) })

type LoggedUser = { readonly id: string; readonly role: string }

/** Ubicación del inicio de sesión, sin bloquear la respuesta del login: si falla, solo queda en consola. */
export const loginRecorder = (o: Observability) => (req: Request, user: LoggedUser): void => {
  const trusted = fromCloudflare(req)
  void o.recordLogin({ userId: user.id, role: user.role, headers: req.headers, trusted })
    .catch((e: unknown) => { console.error('[login-event]', e instanceof Error ? e.message : e) })
}
