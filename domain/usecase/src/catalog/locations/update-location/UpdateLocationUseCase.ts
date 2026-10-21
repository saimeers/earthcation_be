import { LocationNotFoundError, type Location, type LocationRepository } from '@earthcation/model'
import type { UpdateLocationCommand } from './UpdateLocationCommand'

/** Cambia municipio, departamento o país. */
export class UpdateLocationUseCase {
  constructor(private readonly locations: LocationRepository) {}

  async execute(cmd: UpdateLocationCommand): Promise<Location> {
    const location = await this.locations.findById(cmd.id)
    if (!location) throw new LocationNotFoundError()
    location.change(cmd.changes)
    await this.locations.save(location)
    return location
  }
}
