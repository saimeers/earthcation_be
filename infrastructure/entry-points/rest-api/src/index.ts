// API pública del punto de entrada HTTP
export { createRouterV1, type RouterV1Deps } from './v1/createRouterV1'
export { catalogRoutesV1, type CatalogV1Deps } from './v1/routes/catalog.routes'
export { varkRoutesV1 } from './v1/routes/vark.routes'
export { sessionRoutesV1 } from './v1/routes/sessions.routes'
export { identityRoutesV1 } from './v1/routes/identity.routes'
export type { Route } from './v1/http/route'
export { createApp, type AppDeps, type AppRoutesLegacy } from './createApp'
export { rateLimiters, type RateLimitDeps, type RateLimiters, type RateLimits, type WindowCounter } from './middlewares/rateLimit'
export { errorHandlerLegacy, notFoundLegacy } from './middlewares/errorHandler'
export { authenticate, requireRole, currentUser } from './middlewares/auth'
export { organizationRoutesLegacy, locationRoutesLegacy, type CatalogRoutesDeps } from './routes/catalog.routes'
export type { OrganizationUseCases } from './controllers/catalog/OrganizationController'
export type { LocationUseCases } from './controllers/catalog/LocationController'

// ── vark ──
export { varkRoutesLegacy, type VarkRoutesDeps } from './routes/vark.routes'
export type { VarkUseCases } from './controllers/vark/VarkController'

// ── deployment ──
export { deployRoutesLegacy, playLocalRoutes, type DeploymentRoutesDeps } from './routes/deployment.routes'
export type { DeploymentUseCases } from './controllers/deployment/DeploymentController'

// ── observability ──
export { visitRoutesLegacy, healthRoutesLegacy, publicHealthLegacy, type ObservabilityRoutesDeps } from './routes/observability.routes'
export type { VisitUseCases } from './controllers/observability/VisitController'
export { loginRecorder, type LoginRecorder, type LoginRecorderDeps, type LoggedUser } from './controllers/observability/loginRecorder'
export { metrics } from './middlewares/metrics'
export { cloudflareEdge, isCloudflare, type CloudflareEdge } from './middlewares/cloudflare'

// ── identity ──
export { authRoutesLegacy, userRoutesLegacy, bulkImportRoutesLegacy, type IdentityRoutesDeps } from './routes/identity.routes'
export type { AuthUseCases } from './controllers/identity/AuthController'
export type { UserUseCases } from './controllers/identity/UserController'
export type { BulkImportUseCases } from './controllers/identity/BulkImportController'

// ── learning ──
export { progressRoutesLegacy, levelRoutesLegacy, telemetryRoutesLegacy, analyticsRoutesLegacy, type LearningRoutesDeps } from './routes/learning.routes'
export type { ProgressUseCases } from './controllers/learning/ProgressController'
export type { LevelUseCases } from './controllers/learning/LevelController'
export type { TelemetryUseCases } from './controllers/learning/TelemetryController'
export type { AnalyticsUseCases } from './controllers/learning/AnalyticsController'

// ── sessions ──
export { sessionRoutesLegacy, type SessionsRoutesDeps } from './routes/sessions.routes'
export type { SessionUseCases } from './controllers/sessions/SessionController'
