export interface CreateVersionCommand {
  readonly label: unknown
  readonly notes: unknown
  /** Tamaño del ZIP que se va a subir (lo declara el panel; se valida contra DEPLOY_MAX_MB). */
  readonly sizeBytes: unknown
  readonly uploadedBy: string
}
