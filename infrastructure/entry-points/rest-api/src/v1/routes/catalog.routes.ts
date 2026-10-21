import { z } from 'zod'
import { listQuery, paginate, sortBy } from '../http/pagination'
import { created, ok, page } from '../http/reply'
import { route, type Route } from '../http/route'
import type { LocationUseCases } from '../../controllers/catalog/LocationController'
import type { OrganizationUseCases } from '../../controllers/catalog/OrganizationController'
import {
  locationDto, organizationDetailDto, organizationDto, toLocationDto, toOrganizationDetailDto, toOrganizationDto,
} from '../dto/catalog'

// Lecturas públicas; crear y editar, admin e instructor; habilitar y deshabilitar, solo admin (igual que v1)
const WRITERS = ['admin', 'instructor'] as const
const ADMINS = ['admin'] as const

const idParams = z.object({ id: z.uuid().describe('Id (UUID) de la localidad o la organización') })
const activeBody = z.object({ isActive: z.boolean().describe('true la habilita, false la deshabilita (no se borra)') })
const bool = z.enum(['true', 'false']).transform((v) => v === 'true')

const LOCATION_SORT = ['municipality', 'department', 'country'] as const
const ORGANIZATION_SORT = ['name', 'type', 'createdAt'] as const

const placeFilters = {
  municipality: z.string().optional().describe('Coincidencia parcial, sin distinguir mayúsculas'),
  department: z.string().optional().describe('Coincidencia parcial, sin distinguir mayúsculas'),
  country: z.string().optional(),
  includeInactive: bool.optional().describe('Incluye las deshabilitadas (por defecto solo las activas)'),
}
const locationsQuery = listQuery.extend(placeFilters)
const placeBody = z.object({ municipality: z.string().min(1), department: z.string().min(1), country: z.string().min(1).optional() })

const organizationFilters = {
  name: z.string().optional().describe('Coincidencia parcial, sin distinguir mayúsculas'),
  type: z.string().optional(),
  includeInactive: bool.optional().describe('Incluye las deshabilitadas (por defecto solo las activas)'),
}
const organizationsQuery = listQuery.extend(organizationFilters)
const organizationBody = z.object({ name: z.string().min(1), type: z.string().min(1).nullable().optional() })

const locationsRoutes = (uc: LocationUseCases): Route[] => [
  route({
    method: 'get', path: '/locations', tag: 'Localidades', summary: 'Lista las localidades',
    query: locationsQuery,
    response: { status: 200, description: 'Una página de localidades', schema: z.array(locationDto), paginated: true },
    handler: async ({ query }) => {
      const found = query.includeInactive ? await uc.list.execute() : await uc.search.execute(query)
      const { items, meta } = paginate(sortBy(found.map(toLocationDto), query.sort, LOCATION_SORT), query)
      return page(items, meta)
    },
  }),
  route({
    method: 'get', path: '/locations/:id', tag: 'Localidades', summary: 'Consulta una localidad',
    params: idParams,
    response: { status: 200, description: 'La localidad', schema: locationDto },
    handler: async ({ params }) => ok(toLocationDto(await uc.get.execute(params.id))),
  }),
  route({
    method: 'post', path: '/locations', tag: 'Localidades', summary: 'Crea una localidad', roles: WRITERS,
    body: placeBody,
    response: { status: 201, description: 'La localidad creada (cabecera Location)', schema: locationDto },
    handler: async ({ body }) => {
      const location = await uc.create.execute(body)
      return created(`/api/v1/locations/${location.id}`, toLocationDto(location))
    },
  }),
  route({
    method: 'patch', path: '/locations/:id', tag: 'Localidades', summary: 'Edita municipio, departamento o país', roles: WRITERS,
    params: idParams, body: placeBody.partial(),
    response: { status: 200, description: 'La localidad actualizada', schema: locationDto },
    handler: async ({ params, body }) => ok(toLocationDto(await uc.update.execute({ id: params.id, changes: body }))),
  }),
  route({
    method: 'put', path: '/locations/:id/active', tag: 'Localidades', summary: 'Habilita o deshabilita una localidad', roles: ADMINS,
    params: idParams, body: activeBody,
    response: { status: 200, description: 'La localidad con su nuevo estado', schema: locationDto },
    handler: async ({ params, body }) => ok(toLocationDto(await uc.changeStatus.execute({ id: params.id, active: body.isActive }))),
  }),
]

const organizationsRoutes = (uc: OrganizationUseCases): Route[] => [
  route({
    method: 'get', path: '/organizations', tag: 'Organizaciones', summary: 'Lista las organizaciones',
    query: organizationsQuery,
    response: { status: 200, description: 'Una página de organizaciones', schema: z.array(organizationDto), paginated: true },
    handler: async ({ query }) => {
      const found = query.includeInactive ? await uc.list.execute() : await uc.search.execute(query)
      const { items, meta } = paginate(sortBy(found.map(toOrganizationDto), query.sort, ORGANIZATION_SORT), query)
      return page(items, meta)
    },
  }),
  route({
    method: 'get', path: '/organizations/types', tag: 'Organizaciones', summary: 'Tipos de organización en uso',
    response: { status: 200, description: 'Tipos distintos de las organizaciones activas', schema: z.array(z.string()) },
    handler: async () => ok(await uc.types.execute()),
  }),
  route({
    method: 'get', path: '/organizations/:id', tag: 'Organizaciones', summary: 'Consulta una organización con sus integrantes',
    params: idParams,
    response: { status: 200, description: 'La organización y los jugadores que pertenecen a ella', schema: organizationDetailDto },
    handler: async ({ params }) => ok(toOrganizationDetailDto(await uc.get.execute(params.id))),
  }),
  route({
    method: 'post', path: '/organizations', tag: 'Organizaciones', summary: 'Crea una organización', roles: WRITERS,
    body: organizationBody,
    response: { status: 201, description: 'La organización creada (cabecera Location)', schema: organizationDto },
    handler: async ({ body }) => {
      const organization = await uc.create.execute({ name: body.name, type: body.type })
      return created(`/api/v1/organizations/${organization.id}`, toOrganizationDto(organization))
    },
  }),
  route({
    method: 'patch', path: '/organizations/:id', tag: 'Organizaciones', summary: 'Edita nombre o tipo', roles: WRITERS,
    params: idParams, body: organizationBody.partial(),
    response: { status: 200, description: 'La organización actualizada', schema: organizationDto },
    handler: async ({ params, body }) => ok(toOrganizationDto(await uc.update.execute({ id: params.id, changes: body }))),
  }),
  route({
    method: 'put', path: '/organizations/:id/active', tag: 'Organizaciones', summary: 'Habilita o deshabilita una organización', roles: ADMINS,
    params: idParams, body: activeBody,
    response: { status: 200, description: 'La organización con su nuevo estado', schema: organizationDto },
    handler: async ({ params, body }) => ok(toOrganizationDto(await uc.changeStatus.execute({ id: params.id, active: body.isActive }))),
  }),
]

export interface CatalogV1Deps {
  readonly organizations: OrganizationUseCases
  readonly locations: LocationUseCases
}

/** Rutas de v1 del catálogo: localidades y organizaciones. */
export const catalogRoutesV1 = (deps: CatalogV1Deps): Route[] => [...locationsRoutes(deps.locations), ...organizationsRoutes(deps.organizations)]
