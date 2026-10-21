import type { VarkListingRow, VarkRepository } from '@earthcation/model'
import type { ListVarkResultsByPlaceQuery } from './ListVarkResultsByPlaceQuery'

/** Resultados de los jugadores con perfil en la localidad (departamento y/o municipio). */
export class ListVarkResultsByPlaceUseCase {
  constructor(private readonly results: VarkRepository) {}

  execute(query: ListVarkResultsByPlaceQuery): Promise<readonly VarkListingRow[]> {
    return this.results.listByPlace(query)
  }
}
