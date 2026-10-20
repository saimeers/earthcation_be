import { Op } from 'sequelize'
import type {
  NewOrganization, Organization, OrganizationDetail, OrganizationFilter, OrganizationRepository,
} from '@earthcation/model'
import type { Models } from '../models'
import { ilike, organizationColumns, rowOf, toMember, toOrganization, type MemberRow, type OrganizationRow } from './mappers'

const BY_NAME: [string, string][] = [['name', 'ASC']]

export class SequelizeOrganizationRepository implements OrganizationRepository {
  constructor(private readonly models: Models) {}

  async findAll(): Promise<Organization[]> {
    return (await this.models.Organization.findAll({ order: BY_NAME })).map((m) => toOrganization(rowOf(m)))
  }

  async search(filter: OrganizationFilter): Promise<Organization[]> {
    const where = { is_active: true, ...ilike({ name: filter.name, type: filter.type }) }
    return (await this.models.Organization.findAll({ where, order: BY_NAME })).map((m) => toOrganization(rowOf(m)))
  }

  async findTypes(): Promise<string[]> {
    const rows = await this.models.Organization.findAll({
      attributes: ['type'], where: { is_active: true, type: { [Op.ne]: null } }, group: ['type'], order: [['type', 'ASC']],
    })
    return rows.map((m) => rowOf<{ type: string }>(m).type)
  }

  async findById(id: string): Promise<Organization | null> {
    const row = await this.models.Organization.findByPk(id)
    return row ? toOrganization(rowOf(row)) : null
  }

  async findDetail(id: string): Promise<OrganizationDetail | null> {
    const row = await this.models.Organization.findByPk(id, { include: [{ model: this.models.UserProfile, as: 'members' }] })
    if (!row) return null
    const r = rowOf<OrganizationRow & { members: MemberRow[] }>(row)
    return { organization: toOrganization(r), members: r.members.map(toMember) }
  }

  async findByName(name: string): Promise<Organization | null> {
    const row = await this.models.Organization.findOne({ where: { name } })
    return row ? toOrganization(rowOf(row)) : null
  }

  async create(o: NewOrganization): Promise<Organization> {
    const values = o.type === null ? { name: o.name } : { name: o.name, type: o.type }
    return toOrganization(rowOf(await this.models.Organization.create(values)))
  }

  async save(o: Organization): Promise<void> {
    await this.models.Organization.update(organizationColumns(o), { where: { id: o.id } })
  }
}
