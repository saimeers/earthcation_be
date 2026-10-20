import { LocationNotFoundError, type Location, type LocationRepository } from '@earthcation/model'
import type { ChangeLocationStatusCommand } from './ChangeLocationStatusCommand'

/** Habilita o deshabilita una localidad (nunca se borra). */
export class ChangeLocationStatusUseCase {
  constructor(private readonly locations: LocationRepository) {}

  async execute(cmd: ChangeLocationStatusCommand): Promise<Location> {
    const location = await this.locations.findById(cmd.id)
    if (!location) throw new LocationNotFoundError()
    if (cmd.active) location.enable()
    else location.disable()
    await this.locations.save(location)
    return location
  }
}
