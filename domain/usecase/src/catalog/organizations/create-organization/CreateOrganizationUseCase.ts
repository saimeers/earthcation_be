import { Organization, OrganizationNameTakenError, type OrganizationRepository } from '@earthcation/model'
import type { CreateOrganizationCommand } from './CreateOrganizationCommand'

/** Crea una organización; el nombre es obligatorio y no se repite. */
export class CreateOrganizationUseCase {
  constructor(private readonly organizations: OrganizationRepository) {}

  async execute(cmd: CreateOrganizationCommand): Promise<Organization> {
    const draft = Organization.prepare(cmd.name, cmd.type)
    if (await this.organizations.findByName(draft.name)) throw new OrganizationNameTakenError()
    return this.organizations.create(draft)
  }
}
