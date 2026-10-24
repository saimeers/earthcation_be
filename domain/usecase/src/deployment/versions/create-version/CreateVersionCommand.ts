export interface CreateVersionCommand {
  readonly label: unknown
  readonly notes: unknown
  /** Tamaño del ZIP que se va a subir (lo declara el panel; se valida contra DEPLOY_MAX_MB). */
  readonly sizeBytes: unknown
  /** null: la sube el CI con el token de despliegue, sin cuenta. */
  readonly uploadedBy: string | null
}
