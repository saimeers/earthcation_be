/** Datos del proceso que atiende: versión desplegada, tiempo encendido y memoria. */
export interface RuntimeInfo {
  readonly version: string
  uptimeSeconds(): number
  memoryMb(): number
}
