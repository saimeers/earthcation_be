/** Firma del enlace de vista previa que valida el Worker; null si falta el secreto compartido. */
export interface PreviewSigner {
  sign(payload: string): string | null
}
