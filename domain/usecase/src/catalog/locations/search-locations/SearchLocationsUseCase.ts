import type { Location, LocationRepository } from '@earthcation/model'
import type { SearchLocationsQuery } from './SearchLocationsQuery'

/** Localidades activas que coinciden con municipio, departamento o país. */
export class SearchLocationsUseCase {
  constructor(private readonly locations: LocationRepository) {}

  execute(query: SearchLocationsQuery): Promise<Location[]> {
    return this.locations.search(query)
  }
}
