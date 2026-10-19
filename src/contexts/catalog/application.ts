import type { DomainError } from '../../shared/errors'
import { andThen, err, fromNullable, ok, type Result } from '../../shared/result'
import {
  locationNotFound, locationTaken, organizationNameTaken, organizationNotFound, toLocationDraft, toLocationPatch,
  toOrganizationDraft, toOrganizationPatch, type Location, type Organization, type OrganizationDetail,
} from './domain'
import type { LocationFilter, LocationRepository, OrganizationFilter, OrganizationRepository } from './ports'

type Input = Readonly<Record<string, unknown>>
type Outcome<T> = Promise<Result<T, DomainError>>

// Casos de uso del catálogo: reciben sus dependencias y devuelven Result (nunca lanzan)

const createOrganization = (repo: OrganizationRepository) => (input: Input): Outcome<Organization> =>
  andThen(toOrganizationDraft(input), async (draft) =>
    (await repo.findByName(draft.name)) ? err(organizationNameTaken()) : ok(await repo.create(draft)))

const updateOrganization = (repo: OrganizationRepository) => async (id: string, input: Input): Outcome<Organization> =>
  fromNullable(await repo.update(id, toOrganizationPatch(input)), organizationNotFound)

const setOrganizationActive = (repo: OrganizationRepository) => async (id: string, isActive: boolean): Outcome<Organization> =>
  fromNullable(await repo.update(id, { isActive }), organizationNotFound)

const createLocation = (repo: LocationRepository) => (input: Input): Outcome<Location> =>
  andThen(toLocationDraft(input), async (draft) =>
    (await repo.findByPlace(draft.municipality, draft.department)) ? err(locationTaken()) : ok(await repo.create(draft)))

const updateLocation = (repo: LocationRepository) => async (id: string, input: Input): Outcome<Location> =>
  fromNullable(await repo.update(id, toLocationPatch(input)), locationNotFound)

const setLocationActive = (repo: LocationRepository) => async (id: string, isActive: boolean): Outcome<Location> =>
  fromNullable(await repo.update(id, { isActive }), locationNotFound)

export const makeOrganizations = (repo: OrganizationRepository) => ({
  list: () => repo.list(),
  search: (filter: OrganizationFilter) => repo.search(filter),
  types: () => repo.types(),
  get: async (id: string): Outcome<OrganizationDetail> => fromNullable(await repo.findDetail(id), organizationNotFound),
  create: createOrganization(repo),
  update: updateOrganization(repo),
  setActive: setOrganizationActive(repo),
})

export const makeLocations = (repo: LocationRepository) => ({
  list: () => repo.list(),
  search: (filter: LocationFilter) => repo.search(filter),
  get: async (id: string): Outcome<Location> => fromNullable(await repo.findActive(id), locationNotFound),
  create: createLocation(repo),
  update: updateLocation(repo),
  setActive: setLocationActive(repo),
})

export type Organizations = ReturnType<typeof makeOrganizations>
export type Locations = ReturnType<typeof makeLocations>
