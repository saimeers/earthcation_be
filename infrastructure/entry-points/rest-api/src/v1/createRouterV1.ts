import { Router, type RequestHandler } from 'express'
import swaggerUi from 'swagger-ui-express'
import { requireRole } from '../middlewares/auth'
import type { Route } from './http/route'
import { buildOpenApi, type ApiInfo } from './openapi/buildOpenApi'
import { errorHandlerV1, notFoundV1 } from './http/errors'

export interface RouterV1Deps {
  readonly routes: readonly Route[]
  readonly authenticate: RequestHandler
  /** `public`: la documentación la ve cualquiera; `staff`: solo admin y desarrollador, con token. */
  readonly docsAccess: 'public' | 'staff'
  readonly info: ApiInfo
  readonly log: (message: string) => void
}

const docsGuard = (deps: RouterV1Deps): RequestHandler[] =>
  (deps.docsAccess === 'staff' ? [deps.authenticate, requireRole('admin', 'developer')] : [])

/**
 * Router de /api/v1: monta cada ruta con su validación y sus roles, publica la documentación (Swagger UI en /docs
 * y el OpenAPI en /openapi.json) y traduce los errores al formato de v1.
 */
export const createRouterV1 = (deps: RouterV1Deps): Router => {
  const router = Router()
  const document = buildOpenApi(deps.routes.map((r) => r.doc), deps.info)
  router.get('/openapi.json', ...docsGuard(deps), (_req, res) => { res.json(document) })
  router.use('/docs', ...docsGuard(deps), swaggerUi.serve, swaggerUi.setup(document, { customSiteTitle: deps.info.title }))
  for (const r of deps.routes) r.mount(router, deps.authenticate)
  router.use(notFoundV1)
  router.use(errorHandlerV1(deps.log))
  return router
}
