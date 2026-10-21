import { Location, LocationTakenError, type LocationRepository } from '@earthcation/model'
import type { CreateLocationCommand } from './CreateLocationCommand'

/** Crea una localidad; municipio y departamento son obligatorios y el par no se repite. */
export class CreateLocationUseCase {
  constructor(private readonly locations: LocationRepository) {}

  async execute(cmd: CreateLocationCommand): Promise<Location> {
    const draft = Location.prepare(cmd)
    if (await this.locations.findByPlace(draft.municipality, draft.department)) throw new LocationTakenError()
    return this.locations.create(draft)
  }
}
