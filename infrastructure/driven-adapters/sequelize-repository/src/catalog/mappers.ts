import { Location, Organization, type OrganizationMember } from '@earthcation/model'
import { Op, type Model } from 'sequelize'

// Filas de Postgres (snake_case) ↔ entidades del dominio
export interface OrganizationRow { id: string; name: string; type: string | null; is_active: boolean; created_at: Date }
export interface MemberRow { id: string; user_id: string; organization_id: string | null; location_id: string | null }
export interface LocationRow { id: string; municipality: string | null; department: string | null; country: string | null; is_active: boolean }

// Sequelize no tipa las filas de modelos definidos con define(): el tipo lo fija quien la lee
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export const rowOf = <T>(m: Model): T => m.get({ plain: true }) as T

export const toOrganization = (r: OrganizationRow): Organization =>
  Organization.restore({ id: r.id, name: r.name, type: r.type, isActive: r.is_active, createdAt: r.created_at })

export const organizationColumns = (o: Organization) => ({ name: o.name, type: o.type, is_active: o.isActive })

export const toMember = (r: MemberRow): OrganizationMember =>
  ({ id: r.id, userId: r.user_id, organizationId: r.organization_id, locationId: r.location_id })

export const toLocation = (r: LocationRow): Location => Location.restore({
  id: r.id, municipality: r.municipality, department: r.department, country: r.country, isActive: r.is_active,
})

export const locationColumns = (l: Location) =>
  ({ municipality: l.municipality, department: l.department, country: l.country, is_active: l.isActive })

/** Coincidencia parcial sin distinguir mayúsculas para cada filtro con valor. */
export const ilike = (filter: Readonly<Record<string, string | undefined>>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(filter).filter(([, v]) => v).map(([k, v]) => [k, { [Op.iLike]: `%${v ?? ''}%` }]))
