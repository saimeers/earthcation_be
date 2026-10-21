import type { LocationRepository, NewLocation, PlaceCatalog } from '@earthcation/model'

export interface SeedPlaceCatalogDeps {
  readonly catalog: PlaceCatalog
  readonly locations: LocationRepository
}

// Municipio + departamento sin mayúsculas ni espacios sobrantes: así se comparan contra lo ya guardado
const placeKey = (municipality: string | null, department: string | null): string =>
  `${(municipality ?? '').trim().toLowerCase()}|${(department ?? '').trim().toLowerCase()}`

// true la primera vez que aparece la clave (el catálogo repite algunos municipios); la deja registrada
const isNew = (known: Set<string>, key: string): boolean => {
  if (known.has(key)) return false
  known.add(key)
  return true
}

/**
 * Siembra el catálogo oficial de municipios (DANE) como localidades. Corre en cada arranque y es idempotente: solo
 * crea los pares municipio + departamento que aún no existen. Devuelve cuántas localidades creó.
 */
export class SeedPlaceCatalogUseCase {
  constructor(private readonly deps: SeedPlaceCatalogDeps) {}

  async execute(): Promise<number> {
    const known = new Set((await this.deps.locations.findAll()).map((l) => placeKey(l.municipality, l.department)))
    const missing = this.catalogPlaces().filter((place) => isNew(known, placeKey(place.municipality, place.department)))
    if (missing.length > 0) await this.deps.locations.createMany(missing)
    return missing.length
  }

  private catalogPlaces(): NewLocation[] {
    return this.deps.catalog.departments().flatMap(({ name, municipalities }) =>
      municipalities.map((municipality) => ({ municipality, department: name, country: 'Colombia' })))
  }
}
