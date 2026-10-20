import type { VarkListingRow, VarkRepository } from '@earthcation/model'

/** Todos los resultados con su usuario y perfil (panel). */
export class ListVarkResultsUseCase {
  constructor(private readonly results: VarkRepository) {}

  execute(): Promise<readonly VarkListingRow[]> {
    return this.results.listAll()
  }
}
