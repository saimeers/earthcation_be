import type { Style, VarkProfile, VarkScores } from './domain'

export type PlaceFilter = { readonly department?: string; readonly municipality?: string }

// Filas tal como las arma la consulta (resultado + usuario + perfil + organización + localidad). Es el modelo
// de lectura que consume el panel por v1; v2 tendrá su propia proyección camelCase.
export type VarkListingRow = Readonly<Record<string, unknown>>

export type VarkRepository = {
  readonly save: (userId: string, scores: VarkScores) => Promise<{ readonly created: boolean }>
  readonly findByUser: (userId: string) => Promise<VarkProfile | null>
  readonly listAll: () => Promise<readonly VarkListingRow[]>
  readonly listByStyle: (style: Style) => Promise<readonly VarkListingRow[]>
  readonly listByPlace: (filter: PlaceFilter) => Promise<readonly VarkListingRow[]>
}
