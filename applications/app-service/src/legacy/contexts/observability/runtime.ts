import type { NextFunction, Request, Response } from 'express'
import sequelize from '../../config/database'
import { getRedis } from '../../config/redis'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { record, isStale, summarize, type MinuteBucket, type RouteSample } from './metrics'
import type { PoolState } from './domain'
import type { HealthProbes, Runtime } from './ports'

// Adaptadores del proceso: reloj, memoria, ping a BD y Redis, y el almacén en memoria de las métricas.

// Versión del desplegable: package.json de app-service (src/legacy/... y dist/legacy/... están a la misma altura)
const { version } = JSON.parse(readFileSync(join(__dirname, '../../../../package.json'), 'utf8')) as { version: string }

export const runtime: Runtime = {
  version,
  now: () => Date.now(),
  uptimeS: () => Math.round(process.uptime()),
  memoryMb: () => Math.round(process.memoryUsage().rss / 1048576),
}

type Pool = { size: number; available: number; using: number; waiting: number; maxSize: number }
type Pinger = { ping: () => Promise<unknown> }

const poolOf = (): PoolState | null => {
  const pool = (sequelize.connectionManager as unknown as { pool?: Pool }).pool
  return pool ? { size: pool.size, available: pool.available, using: pool.using, waiting: pool.waiting, max: pool.maxSize } : null
}

const cachePing = () => {
  const redis = getRedis() as Pinger | null
  return redis ? () => redis.ping() : null
}

// ── Métricas por minuto ───────────────────────────────────────────────────────

const minuteNow = () => Math.floor(Date.now() / 60000)

// Único estado mutable del contexto: las cubetas de la ventana. Cada cubeta se reemplaza, no se edita.
const buckets = new Map<number, MinuteBucket>()

const prune = (now: number) => {
  // eslint-disable-next-line functional/immutable-data -- quitar minutos viejos del almacén en memoria
  ;[...buckets.keys()].filter((m) => isStale(m, now)).forEach((m) => buckets.delete(m))
}

const recordRequest = (route: string, ms: number, failed: boolean) => {
  const now = minuteNow()
  const bucket: MinuteBucket = buckets.get(now) ?? new Map<string, RouteSample>()
  // eslint-disable-next-line functional/immutable-data -- el almacén en memoria es el borde con estado
  buckets.set(now, new Map(bucket).set(route, record(bucket.get(route), ms, failed)))
  prune(now)
}

// '/api/sessions/123/progress' -> '/api/sessions/:id/progress' (agrupa por ruta, no por recurso)
const routeKey = (req: Request): string => {
  const path = (req.route as { path?: unknown } | undefined)?.path
  return `${req.method} ${req.baseUrl}${typeof path === 'string' ? path : req.path}`.replace(/\/[0-9a-f-]{8,}(?=\/|$)/gi, '/:id')
}

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const start = process.hrtime.bigint()
  res.on('finish', () => { recordRequest(routeKey(req), Number(process.hrtime.bigint() - start) / 1e6, res.statusCode >= 500) })
  next()
}

export const healthProbes: HealthProbes = {
  pingDatabase: () => sequelize.query('SELECT 1'),
  cachePing,
  pool: poolOf,
  metrics: () => summarize(buckets, minuteNow()),
}
