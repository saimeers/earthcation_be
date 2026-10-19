import type {
  Location, LocationDraft, LocationPatch, Organization, OrganizationDetail, OrganizationDraft, OrganizationPatch,
} from './domain'

export type OrganizationFilter = { readonly name?: string; readonly type?: string }
export type LocationFilter = { readonly municipality?: string; readonly department?: string; readonly country?: string }

// Puertos del catálogo: el dominio y los casos de uso no saben de Sequelize
export type OrganizationRepository = {
  readonly list: () => Promise<readonly Organization[]>
  readonly search: (filter: OrganizationFilter) => Promise<readonly Organization[]>
  readonly types: () => Promise<readonly string[]>
  readonly findDetail: (id: string) => Promise<OrganizationDetail | null>
  readonly findByName: (name: string) => Promise<Organization | null>
  readonly create: (draft: OrganizationDraft) => Promise<Organization>
  readonly update: (id: string, patch: OrganizationPatch & { readonly isActive?: boolean }) => Promise<Organization | null>
}

export type LocationRepository = {
  readonly list: () => Promise<readonly Location[]>
  readonly search: (filter: LocationFilter) => Promise<readonly Location[]>
  readonly findActive: (id: string) => Promise<Location | null>
  readonly findByPlace: (municipality: string, department: string) => Promise<Location | null>
  readonly create: (draft: LocationDraft) => Promise<Location>
  readonly update: (id: string, patch: LocationPatch & { readonly isActive?: boolean }) => Promise<Location | null>
}
