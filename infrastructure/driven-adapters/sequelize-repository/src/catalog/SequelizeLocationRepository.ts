import type { Location, LocationFilter, LocationRepository, NewLocation } from '@earthcation/model'
import type { Models } from '../models'
import { ilike, locationColumns, rowOf, toLocation, type LocationRow } from './mappers'

const BY_PLACE: [string, string][] = [['department', 'ASC'], ['municipality', 'ASC']]

export class SequelizeLocationRepository implements LocationRepository {
  constructor(private readonly models: Models) {}

  async findAll(): Promise<Location[]> {
    return (await this.models.Location.findAll({ order: BY_PLACE })).map((m) => toLocation(rowOf(m)))
  }

  async search(filter: LocationFilter): Promise<Location[]> {
    const where = { is_active: true, ...ilike({ municipality: filter.municipality, department: filter.department, country: filter.country }) }
    return (await this.models.Location.findAll({ where, order: BY_PLACE })).map((m) => toLocation(rowOf(m)))
  }

  async findById(id: string): Promise<Location | null> {
    const row = await this.models.Location.findByPk(id)
    return row ? toLocation(rowOf<LocationRow>(row)) : null
  }

  async findActiveById(id: string): Promise<Location | null> {
    const row = await this.models.Location.findOne({ where: { id, is_active: true } })
    return row ? toLocation(rowOf<LocationRow>(row)) : null
  }

  async findByPlace(municipality: string, department: string): Promise<Location | null> {
    const row = await this.models.Location.findOne({ where: { municipality, department } })
    return row ? toLocation(rowOf<LocationRow>(row)) : null
  }

  // Sin país, el modelo pone Colombia
  async create(l: NewLocation): Promise<Location> {
    return toLocation(rowOf(await this.models.Location.create({ ...l })))
  }

  async save(l: Location): Promise<void> {
    await this.models.Location.update(locationColumns(l), { where: { id: l.id } })
  }
}
