import type { NewOrganization, Organization } from '../Organization'

export interface OrganizationFilter {
  readonly name?: string
  readonly type?: string
}

/** Perfil de un jugador que pertenece a la organización. */
export interface OrganizationMember {
  readonly id: string
  readonly userId: string
  readonly organizationId: string | null
  readonly locationId: string | null
}

export interface OrganizationDetail {
  readonly organization: Organization
  readonly members: readonly OrganizationMember[]
}

/** Puerto de salida: persistencia de organizaciones. */
export interface OrganizationRepository {
  findAll(): Promise<Organization[]>
  /** Solo las activas; coincidencia parcial sin distinguir mayúsculas. */
  search(filter: OrganizationFilter): Promise<Organization[]>
  /** Tipos distintos de las organizaciones activas, en orden alfabético. */
  findTypes(): Promise<string[]>
  findById(id: string): Promise<Organization | null>
  findDetail(id: string): Promise<OrganizationDetail | null>
  findByName(name: string): Promise<Organization | null>
  create(organization: NewOrganization): Promise<Organization>
  save(organization: Organization): Promise<void>
}
