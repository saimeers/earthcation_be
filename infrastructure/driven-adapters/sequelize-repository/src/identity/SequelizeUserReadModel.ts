import type { IncludeOptions } from 'sequelize'
import type { LoginProfile, UserFilter, UserListingRow, UserReadModel } from '@earthcation/model'
import type { Models } from '../models'
import { rowOf } from './mappers'

const SECRET_ATTRS = ['password_hash', 'reset_token_hash', 'reset_token_expires']
const VARK_ATTRS = ['dominant_style', 'visual_score', 'auditory_score', 'reading_score']
const SESSION_ATTRS = ['id', 'name', 'code', 'status', 'started_at', 'ended_at', 'created_at']

type Row = Readonly<Record<string, unknown>>

const defined = (o: Row): Row => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
const objectOr = (v: unknown): Row | null => (v !== null && typeof v === 'object' ? (v as Row) : null)

// null si no ha hecho el test VARK
const styleOf = (vark: unknown): string | null => {
  const style = objectOr(vark)?.dominant_style
  return typeof style === 'string' ? style : null
}

/** Filas crudas de v1 para el panel (usuarios con perfil, organización, localidad y VARK; sin secretos). */
export class SequelizeUserReadModel implements UserReadModel {
  constructor(private readonly models: Models) {}

  async list(filter: UserFilter): Promise<UserListingRow[]> {
    const rows = await this.models.User.findAll({
      where: defined({ role: filter.role }), attributes: { exclude: SECRET_ATTRS },
      include: [this.filteredPlace(filter), this.withVark()], order: [['created_at', 'DESC']],
    })
    return rows.map((m) => rowOf<UserListingRow>(m))
  }

  async get(id: string): Promise<UserListingRow | null> {
    const row = await this.models.User.findByPk(id, { attributes: { exclude: SECRET_ATTRS }, include: [this.withPlace(), this.withVark()] })
    return row ? rowOf<UserListingRow>(row) : null
  }

  async sessions(id: string): Promise<UserListingRow[]> {
    const rows = await this.models.SessionUser.findAll({
      where: { user_id: id }, include: [{ model: this.models.TrainingSession, as: 'session', attributes: SESSION_ATTRS }],
      order: [['joined_at', 'DESC']],
    })
    return rows.map((m) => rowOf<UserListingRow>(m))
  }

  async loginProfile(id: string): Promise<LoginProfile> {
    const row = await this.models.User.findByPk(id, { attributes: ['id'], include: [{ association: 'varkProfile' }, this.withPlace()] })
    const r = row ? rowOf<Row>(row) : {}
    const profile = objectOr(r.profile) ?? {}
    return { dominantStyle: styleOf(r.varkProfile), organization: objectOr(profile.organization), location: objectOr(profile.location) }
  }

  private withPlace(): IncludeOptions {
    return {
      model: this.models.UserProfile, as: 'profile',
      include: [{ model: this.models.Organization, as: 'organization' }, { model: this.models.Location, as: 'location' }],
    }
  }

  private withVark(): IncludeOptions {
    return { model: this.models.VarkResult, as: 'varkProfile', attributes: VARK_ATTRS }
  }

  // Con filtro de organización o localidad solo salen usuarios con perfil (join obligatorio, como antes)
  private filteredPlace(f: UserFilter): IncludeOptions {
    const where = defined({ organization_id: f.organizationId, location_id: f.locationId })
    const required = Object.keys(where).length > 0
    return { ...this.withPlace(), where: required ? where : undefined, required }
  }
}
