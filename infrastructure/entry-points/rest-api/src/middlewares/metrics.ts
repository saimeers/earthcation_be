import type { Request, RequestHandler } from 'express'
import type { MetricsStore } from '@earthcation/model'

// '/api/sessions/123/progress' -> '/api/sessions/:id/progress' (agrupa por ruta, no por recurso)
const routeKey = (req: Request): string => {
  const path = (req.route as { path?: unknown } | undefined)?.path
  return `${req.method} ${req.baseUrl}${typeof path === 'string' ? path : req.path}`.replace(/\/[0-9a-f-]{8,}(?=\/|$)/gi, '/:id')
}

/** Mide cada petición (latencia y si terminó en 5xx) y la suma a las métricas de su ruta. */
export const metrics = (store: MetricsStore): RequestHandler => (req, res, next) => {
  const start = process.hrtime.bigint()
  res.on('finish', () => {
    store.record(routeKey(req), Number(process.hrtime.bigint() - start) / 1e6, res.statusCode >= 500)
  })
  next()
}
