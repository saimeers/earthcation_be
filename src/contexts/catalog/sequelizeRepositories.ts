import { Op, type Model, type WhereOptions } from 'sequelize'
import models from '../../models'
import type { Location, Organization, OrganizationDetail, OrganizationMember } from './domain'
import type { LocationRepository, OrganizationRepository } from './ports'

// Adaptador Sequelize del catálogo: filas snake_case de Postgres <-> tipos del dominio
type OrganizationRow = { id: string; name: string; type: string | null; is_active: boolean; created_at: Date }
type MemberRow = { id: string; user_id: string; organization_id: string | null; location_id: string | null }
type LocationRow = { id: string; municipality: string | null; department: string | null; country: string | null; is_active: boolean }

// Sequelize no tipa las filas de modelos JS: el tipo de la fila lo fija quien la lee
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
const plain = <T>(m: Model): T => m.get({ plain: true }) as T
const defined = (o: Readonly<Record<string, unknown>>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
const ilike = (filter: Readonly<Record<string, string | undefined>>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(filter).filter(([, v]) => v).map(([k, v]) => [k, { [Op.iLike]: `%${v ?? ''}%` }]))

const toOrganization = (r: OrganizationRow): Organization =>
  ({ id: r.id, name: r.name, type: r.type, isActive: r.is_active, createdAt: r.created_at })
const toMember = (r: MemberRow): OrganizationMember =>
  ({ id: r.id, userId: r.user_id, organizationId: r.organization_id, locationId: r.location_id })
const toDetail = (r: OrganizationRow & { members: MemberRow[] }): OrganizationDetail =>
  ({ ...toOrganization(r), members: r.members.map(toMember) })
const toLocation = (r: LocationRow): Location =>
  ({ id: r.id, municipality: r.municipality, department: r.department, country: r.country, isActive: r.is_active })

const ORG_ORDER = [['name', 'ASC']] as [string, string][]
const LOCATION_ORDER = [['department', 'ASC'], ['municipality', 'ASC']] as [string, string][]
const orgRows = async (where?: WhereOptions) =>
  (await models.Organization.findAll({ where: where ?? {}, order: ORG_ORDER })).map((m) => toOrganization(plain(m)))
const locationRows = async (where?: WhereOptions) =>
  (await models.Location.findAll({ where: where ?? {}, order: LOCATION_ORDER })).map((m) => toLocation(plain(m)))

// Actualiza solo los campos dados; null si no existe
const updateRow = async <R>(model: typeof models.Organization, id: string, values: Readonly<Record<string, unknown>>) => {
  const row = await model.findByPk(id)
  return row ? plain<R>(await row.update(defined(values))) : null
}

const organizationTypes = async (): Promise<readonly string[]> =>
  (await models.Organization.findAll({
    attributes: ['type'], where: { is_active: true, type: { [Op.ne]: null } }, group: ['type'], order: [['type', 'ASC']],
  })).map((m) => plain<{ type: string }>(m).type)

const findOrganizationDetail = async (id: string) => {
  const row = await models.Organization.findByPk(id, { include: [{ model: models.UserProfile, as: 'members' }] })
  return row ? toDetail(plain(row)) : null
}

export const organizationRepository: OrganizationRepository = {
  list: () => orgRows(),
  search: (f) => orgRows({ is_active: true, ...ilike(f) }),
  types: organizationTypes,
  findDetail: findOrganizationDetail,
  findByName: async (name) => { const r = await models.Organization.findOne({ where: { name } }); return r ? toOrganization(plain(r)) : null },
  create: async (d) => toOrganization(plain(await models.Organization.create(defined({ name: d.name, type: d.type })))),
  update: async (id, p) => {
    const row = await updateRow<OrganizationRow>(models.Organization, id, { name: p.name, type: p.type, is_active: p.isActive })
    return row ? toOrganization(row) : null
  },
}

export const locationRepository: LocationRepository = {
  list: () => locationRows(),
  search: (f) => locationRows({ is_active: true, ...ilike(f) }),
  findActive: async (id) => { const r = await models.Location.findOne({ where: { id, is_active: true } }); return r ? toLocation(plain(r)) : null },
  findByPlace: async (municipality, department) => {
    const r = await models.Location.findOne({ where: { municipality, department } })
    return r ? toLocation(plain(r)) : null
  },
  create: async (d) => toLocation(plain(await models.Location.create(defined({ ...d })))),
  update: async (id, p) => {
    const values = { municipality: p.municipality, department: p.department, country: p.country, is_active: p.isActive }
    const row = await updateRow<LocationRow>(models.Location, id, values)
    return row ? toLocation(row) : null
  },
}
