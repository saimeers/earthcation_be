import { parseVarkStyle, type VarkListingRow, type VarkRepository } from '@earthcation/model'

/** Resultados cuyo estilo dominante es el pedido; un estilo desconocido es un error de validación. */
export class ListVarkResultsByStyleUseCase {
  constructor(private readonly results: VarkRepository) {}

  async execute(style: string): Promise<readonly VarkListingRow[]> {
    return this.results.listByStyle(parseVarkStyle(style))
  }
}
