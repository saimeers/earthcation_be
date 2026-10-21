import { Router, type RequestHandler } from 'express'
import { requireRole } from '../middlewares/auth'
import { LocationController, type LocationUseCases } from '../controllers/catalog/LocationController'
import { OrganizationController, type OrganizationUseCases } from '../controllers/catalog/OrganizationController'

export interface CatalogRoutesDeps {
  readonly authenticate: RequestHandler
  readonly organizations: OrganizationUseCases
  readonly locations: LocationUseCases
}

// Las lecturas son públicas; crear y editar, admin e instructor; habilitar y deshabilitar, solo admin
const writers = (auth: RequestHandler) => [auth, requireRole('admin', 'instructor')]
const admins = (auth: RequestHandler) => [auth, requireRole('admin')]

/** /api/organizations (v1) */
export const organizationRoutesV1 = (deps: CatalogRoutesDeps): Router => {
  const c = new OrganizationController(deps.organizations)
  return Router()
    .get('/', c.list).get('/search', c.search).get('/types', c.types).get('/:id', c.get)
    .post('/', ...writers(deps.authenticate), c.create)
    .put('/:id', ...writers(deps.authenticate), c.update)
    .patch('/:id/disable', ...admins(deps.authenticate), c.disable)
    .patch('/:id/enable', ...admins(deps.authenticate), c.enable)
}

/** /api/locations (v1) */
export const locationRoutesV1 = (deps: CatalogRoutesDeps): Router => {
  const c = new LocationController(deps.locations)
  return Router()
    .get('/', c.list).get('/search', c.search).get('/:id', c.get)
    .post('/', ...writers(deps.authenticate), c.create)
    .put('/:id', ...writers(deps.authenticate), c.update)
    .patch('/:id/disable', ...admins(deps.authenticate), c.disable)
    .patch('/:id/enable', ...admins(deps.authenticate), c.enable)
}
