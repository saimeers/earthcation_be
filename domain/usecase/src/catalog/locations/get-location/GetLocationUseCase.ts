import { LocationNotFoundError, type Location, type LocationRepository } from '@earthcation/model'

/** Una localidad activa (una deshabilitada responde como no encontrada). */
export class GetLocationUseCase {
  constructor(private readonly locations: LocationRepository) {}

  async execute(id: string): Promise<Location> {
    const location = await this.locations.findActiveById(id)
    if (!location) throw new LocationNotFoundError()
    return location
  }
}
