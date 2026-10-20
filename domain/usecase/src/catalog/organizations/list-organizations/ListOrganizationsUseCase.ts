import type { Organization, OrganizationRepository } from '@earthcation/model'

/** Todas las organizaciones (activas e inactivas), por nombre. */
export class ListOrganizationsUseCase {
  constructor(private readonly organizations: OrganizationRepository) {}

  execute(): Promise<Organization[]> {
    return this.organizations.findAll()
  }
}
