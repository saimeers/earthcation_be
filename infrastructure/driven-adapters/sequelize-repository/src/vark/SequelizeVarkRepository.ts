import type { FindOptions, IncludeOptions } from 'sequelize'
import type {
  VarkListingRow, VarkPlaceFilter, VarkRepository, VarkResult, VarkSaveOutcome, VarkScores, VarkStyle,
} from '@earthcation/model'
import type { Models } from '../models'
import { rowOf } from '../catalog/mappers'
import { definedOnly, toVarkResult, varkColumns, type VarkRow } from './mappers'

const USER_ATTRS = ['id', 'first_name', 'last_name', 'cedula']
const BY_STYLE: [string, string][] = [['dominant_style', 'ASC']]

export class SequelizeVarkRepository implements VarkRepository {
  constructor(private readonly models: Models) {}

  async save(userId: string, scores: VarkScores): Promise<VarkSaveOutcome> {
    const [, created] = await this.models.VarkResult.upsert(varkColumns(userId, scores), { returning: true })
    return { created: Boolean(created) }
  }

  async findByUser(userId: string): Promise<VarkResult | null> {
    const row = await this.models.VarkResult.findOne({ where: { user_id: userId } })
    return row ? toVarkResult(rowOf<VarkRow>(row)) : null
  }

  listAll(): Promise<readonly VarkListingRow[]> {
    return this.listing({ include: [this.withUser([...USER_ATTRS, 'role'])], order: BY_STYLE })
  }

  listByStyle(style: VarkStyle): Promise<readonly VarkListingRow[]> {
    return this.listing({ where: { dominant_style: style }, include: [this.withUser(USER_ATTRS)] })
  }

  listByPlace(filter: VarkPlaceFilter): Promise<readonly VarkListingRow[]> {
    return this.listing({ include: [this.withPlace(filter)], order: BY_STYLE })
  }

  private async listing(options: FindOptions): Promise<readonly VarkListingRow[]> {
    return (await this.models.VarkResult.findAll(options)).map((m) => rowOf<VarkListingRow>(m))
  }

  // Usuario con su perfil, organización y localidad (join opcional: también salen los que no tienen perfil)
  private withUser(attributes: readonly string[]): IncludeOptions {
    const profile: IncludeOptions = {
      model: this.models.UserProfile, as: 'profile', include: [{ association: 'organization' }, { association: 'location' }],
    }
    return { model: this.models.User, as: 'user', attributes: [...attributes], include: [profile] }
  }

  // Solo los jugadores con perfil en esa localidad (join obligatorio, como antes)
  private withPlace(filter: VarkPlaceFilter): IncludeOptions {
    const location: IncludeOptions = { model: this.models.Location, as: 'location', where: definedOnly(filter), required: true }
    return {
      model: this.models.User, as: 'user', attributes: USER_ATTRS, required: true,
      include: [{ model: this.models.UserProfile, as: 'profile', required: true, include: [location] }],
    }
  }
}
