import type { Place } from '../bulk-import/PlaceMatcher'
import type { Sheet } from '../bulk-import/AnmSheet'

/** Puerto de salida: lee la primera hoja de un libro de Excel como filas de celdas. */
export interface SpreadsheetReader {
  firstSheet(file: Uint8Array): Sheet
}

export interface DirectoryEntry {
  readonly id: string
  readonly created: boolean
}

/**
 * Puerto de salida: organizaciones y localidades que la importación encuentra (sin distinguir mayúsculas: el Excel
 * casi nunca escribe el nombre igual a como está guardado) o crea. No usa el alta del catálogo, que responde 409
 * a un nombre existente y rompería un lote con la misma organización en varias filas.
 */
export interface ImportDirectory {
  organization(name: string): Promise<DirectoryEntry>
  location(place: Place): Promise<DirectoryEntry>
}

export interface CatalogDepartment {
  readonly name: string
  readonly municipalities: readonly string[]
}

/** Puerto de salida: catálogo cerrado de departamentos y municipios de Colombia. */
export interface PlaceCatalog {
  departments(): readonly CatalogDepartment[]
}
