/** Coordenadas DIVIPOLA de un municipio para el mapa de minas; `exact` es falso cuando se usó la capital del departamento. */
export interface Coordinates {
  readonly lat: number
  readonly lng: number
  readonly code: string
  readonly exact: boolean
}

/** Puerto de salida: ubica un municipio/departamento libre (como viene del catálogo propio) en DIVIPOLA. */
export interface MunicipalityCoordinates {
  /** `null` solo si el departamento no existe en DIVIPOLA; sin coincidencia exacta, la capital con `exact: false`. */
  locate(municipality: string, department: string): Coordinates | null
}
