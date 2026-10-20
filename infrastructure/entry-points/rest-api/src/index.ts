// API pública del punto de entrada HTTP
export { errorHandlerV1, notFoundV1 } from './middlewares/errorHandler'
export { authenticate, requireRole, currentUser } from './middlewares/auth'
export { organizationRoutesV1, locationRoutesV1, type CatalogRoutesDeps } from './routes/catalog.routes'
export type { OrganizationUseCases } from './controllers/catalog/OrganizationController'
export type { LocationUseCases } from './controllers/catalog/LocationController'

// ── vark ──
export { varkRoutesV1, type VarkRoutesDeps } from './routes/vark.routes'
export type { VarkUseCases } from './controllers/vark/VarkController'

// ── deployment ──
export { deployRoutesV1, playLocalRoutes, type DeploymentRoutesDeps } from './routes/deployment.routes'
export type { DeploymentUseCases } from './controllers/deployment/DeploymentController'

// ── observability ──
export { visitRoutesV1, healthRoutesV1, publicHealthV1, type ObservabilityRoutesDeps } from './routes/observability.routes'
export type { VisitUseCases } from './controllers/observability/VisitController'
export { loginRecorder, type LoginRecorder, type LoginRecorderDeps, type LoggedUser } from './controllers/observability/loginRecorder'
export { metrics } from './middlewares/metrics'
export { cloudflareEdge, isCloudflare, type CloudflareEdge } from './middlewares/cloudflare'

// ── identity ──
export { authRoutesV1, userRoutesV1, bulkImportRoutesV1, type IdentityRoutesDeps } from './routes/identity.routes'
export type { AuthUseCases } from './controllers/identity/AuthController'
export type { UserUseCases } from './controllers/identity/UserController'
export type { BulkImportUseCases } from './controllers/identity/BulkImportController'
