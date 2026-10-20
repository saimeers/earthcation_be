import type { Location, NewLocation } from '../Location'

export interface LocationFilter {
  readonly municipality?: string
  readonly department?: string
  readonly country?: string
}

/** Puerto de salida: persistencia de localidades. */
export interface LocationRepository {
  findAll(): Promise<Location[]>
  /** Solo las activas; coincidencia parcial sin distinguir mayúsculas. */
  search(filter: LocationFilter): Promise<Location[]>
  findById(id: string): Promise<Location | null>
  findActiveById(id: string): Promise<Location | null>
  findByPlace(municipality: string, department: string): Promise<Location | null>
  create(location: NewLocation): Promise<Location>
  save(location: Location): Promise<void>
}
