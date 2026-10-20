import { OrganizationNotFoundError, type OrganizationDetail, type OrganizationRepository } from '@earthcation/model'

/** Una organización con los perfiles de sus miembros. */
export class GetOrganizationUseCase {
  constructor(private readonly organizations: OrganizationRepository) {}

  async execute(id: string): Promise<OrganizationDetail> {
    const detail = await this.organizations.findDetail(id)
    if (!detail) throw new OrganizationNotFoundError()
    return detail
  }
}
