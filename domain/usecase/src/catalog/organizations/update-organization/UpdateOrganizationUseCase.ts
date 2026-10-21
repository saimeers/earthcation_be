import { OrganizationNotFoundError, type Organization, type OrganizationRepository } from '@earthcation/model'
import type { UpdateOrganizationCommand } from './UpdateOrganizationCommand'

/** Cambia nombre y tipo; el resto de campos no se edita por aquí. */
export class UpdateOrganizationUseCase {
  constructor(private readonly organizations: OrganizationRepository) {}

  async execute(cmd: UpdateOrganizationCommand): Promise<Organization> {
    const organization = await this.organizations.findById(cmd.id)
    if (!organization) throw new OrganizationNotFoundError()
    organization.change(cmd.changes)
    await this.organizations.save(organization)
    return organization
  }
}
