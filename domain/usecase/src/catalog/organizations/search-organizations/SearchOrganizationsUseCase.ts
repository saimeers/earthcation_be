import type { Organization, OrganizationRepository } from '@earthcation/model'
import type { SearchOrganizationsQuery } from './SearchOrganizationsQuery'

/** Organizaciones activas cuyo nombre o tipo contiene el texto buscado. */
export class SearchOrganizationsUseCase {
  constructor(private readonly organizations: OrganizationRepository) {}

  execute(query: SearchOrganizationsQuery): Promise<Organization[]> {
    return this.organizations.search(query)
  }
}
