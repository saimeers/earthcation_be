import { Router, type RequestHandler } from 'express'
import swaggerUi from 'swagger-ui-express'
import { requireRole } from '../middlewares/auth'
import { acceptDeployToken } from '../middlewares/deployToken'
import type { IdempotencyGuard } from './http/idempotency'
import type { MountKit, Route } from './http/route'
import { buildOpenApi, type ApiInfo } from './openapi/buildOpenApi'
import { errorHandlerV1, notFoundV1 } from './http/errors'

export interface RouterV1Deps {
  readonly routes: readonly Route[]
  readonly authenticate: RequestHandler
  /** Repite la respuesta guardada cuando un cliente reintenta una petición con la misma `Idempotency-Key`. */
  readonly idempotency: IdempotencyGuard
  /** Token de despliegue del CI (`acceptDeployToken`). Sin él, la cabecera x-deploy-token siempre es 401. */
  readonly deployToken?: RequestHandler
  /** `public`: la documentación la ve cualquiera; `staff`: solo admin y desarrollador, con token. */
  readonly docsAccess: 'public' | 'staff'
  readonly info: ApiInfo
  readonly log: (message: string) => void
}

const docsGuard = (deps: RouterV1Deps): RequestHandler[] =>
  (deps.docsAccess === 'staff' ? [deps.authenticate, requireRole('admin', 'developer')] : [])

const mountRoutes = (router: Router, deps: RouterV1Deps): void => {
  const kit: MountKit = {
    authenticate: deps.authenticate,
    idempotency: deps.idempotency,
    deployToken: deps.deployToken ?? acceptDeployToken(undefined),
  }
  for (const r of deps.routes) r.mount(router, kit)
}

/**
 * Router de /api/v1: monta cada ruta con su validación y sus roles, publica la documentación (Swagger UI en /docs
 * y el OpenAPI en /openapi.json) y traduce los errores al formato de v1.
 */
export const createRouterV1 = (deps: RouterV1Deps): Router => {
  const router = Router()
  const document = buildOpenApi(deps.routes.map((r) => r.doc), deps.info)
  router.get('/openapi.json', ...docsGuard(deps), (_req, res) => { res.json(document) })
  router.use('/docs', ...docsGuard(deps), swaggerUi.serve, swaggerUi.setup(document, { customSiteTitle: deps.info.title }))
  mountRoutes(router, deps)
  router.use(notFoundV1)
  router.use(errorHandlerV1(deps.log))
  return router
}
