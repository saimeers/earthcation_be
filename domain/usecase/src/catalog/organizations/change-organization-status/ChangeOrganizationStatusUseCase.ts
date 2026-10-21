import { OrganizationNotFoundError, type Organization, type OrganizationRepository } from '@earthcation/model'
import type { ChangeOrganizationStatusCommand } from './ChangeOrganizationStatusCommand'

/** Habilita o deshabilita una organización (nunca se borra). */
export class ChangeOrganizationStatusUseCase {
  constructor(private readonly organizations: OrganizationRepository) {}

  async execute(cmd: ChangeOrganizationStatusCommand): Promise<Organization> {
    const organization = await this.organizations.findById(cmd.id)
    if (!organization) throw new OrganizationNotFoundError()
    if (cmd.active) organization.enable()
    else organization.disable()
    await this.organizations.save(organization)
    return organization
  }
}
