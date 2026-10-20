// API pública del punto de entrada HTTP
export { errorHandlerV1, notFoundV1 } from './middlewares/errorHandler'
export { authenticate, requireRole, currentUser } from './middlewares/auth'
export { organizationRoutesV1, locationRoutesV1, type CatalogRoutesDeps } from './routes/catalog.routes'
export type { OrganizationUseCases } from './controllers/catalog/OrganizationController'
export type { LocationUseCases } from './controllers/catalog/LocationController'

// ── vark ──
export { varkRoutesV1, type VarkRoutesDeps } from './routes/vark.routes'
export type { VarkUseCases } from './controllers/vark/VarkController'
