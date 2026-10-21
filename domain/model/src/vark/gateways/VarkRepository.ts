import type { VarkStyle } from '../Style'
import type { VarkResult, VarkScores } from '../VarkResult'

/** Filtro por localidad del jugador; los campos sin valor no filtran. */
export interface VarkPlaceFilter {
  readonly department?: string
  readonly municipality?: string
}

/**
 * Modelo de lectura de los listados del panel: filas tal como las arma la consulta (resultado + usuario + perfil +
 * organización + localidad). La API legacy las devuelve crudas; v1 tendrá su propia proyección.
 */
export type VarkListingRow = Readonly<Record<string, unknown>>

/** Si el guardado creó el resultado o reemplazó el anterior. */
export interface VarkSaveOutcome {
  readonly created: boolean
}

/** Puerto de salida: persistencia de resultados VARK (uno por jugador). */
export interface VarkRepository {
  /** Crea o reemplaza el resultado del jugador. */
  save(userId: string, scores: VarkScores): Promise<VarkSaveOutcome>
  findByUser(userId: string): Promise<VarkResult | null>
  /** Todos, con usuario (incluye el rol) y su perfil; por estilo dominante ascendente. */
  listAll(): Promise<readonly VarkListingRow[]>
  listByStyle(style: VarkStyle): Promise<readonly VarkListingRow[]>
  /** Solo jugadores con perfil en una localidad que cumple el filtro; por estilo dominante ascendente. */
  listByPlace(filter: VarkPlaceFilter): Promise<readonly VarkListingRow[]>
}
