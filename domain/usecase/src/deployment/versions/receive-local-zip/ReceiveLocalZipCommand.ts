export interface ReceiveLocalZipCommand {
  readonly id: string
  /** Cuerpo del PUT; null si no llegó un ZIP. */
  readonly zip: Uint8Array | null
}
