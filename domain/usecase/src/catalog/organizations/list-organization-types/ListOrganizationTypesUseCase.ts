import type { OrganizationRepository } from '@earthcation/model'

/** Tipos en uso por las organizaciones activas (para el filtro del panel). */
export class ListOrganizationTypesUseCase {
  constructor(private readonly organizations: OrganizationRepository) {}

  execute(): Promise<string[]> {
    return this.organizations.findTypes()
  }
}
