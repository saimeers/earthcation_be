import { makeLocations, makeOrganizations } from './application'
import { locationsRouterV1, organizationsRouterV1 } from './httpV1'
import { locationRepository, organizationRepository } from './sequelizeRepositories'

// Raíz de composición del catálogo: casos de uso + adaptador Sequelize + rutas v1
export const organizations = makeOrganizations(organizationRepository)
export const locations = makeLocations(locationRepository)

export const organizationRoutesV1 = organizationsRouterV1(organizations)
export const locationRoutesV1 = locationsRouterV1(locations)
