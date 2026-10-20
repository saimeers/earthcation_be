import type { Location, LocationRepository } from '@earthcation/model'

/** Todas las localidades, por departamento y municipio. */
export class ListLocationsUseCase {
  constructor(private readonly locations: LocationRepository) {}

  execute(): Promise<Location[]> {
    return this.locations.findAll()
  }
}
