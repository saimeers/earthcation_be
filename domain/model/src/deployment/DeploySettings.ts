/** Configuración del despliegue que usan los casos de uso (la lee y valida app-service). */
export interface DeploySettings {
  /** Tamaño máximo del ZIP (DEPLOY_MAX_MB). */
  readonly maxMb: number
  /** Dónde sirve el Worker el juego publicado, sin barra final (PLAY_URL). */
  readonly playUrl: string
}

/** Segundos que vale el enlace firmado de una vista previa. */
export const PREVIEW_TTL_S = 2 * 3600

/** Lo que firma el enlace de vista previa; el Worker recalcula el mismo HMAC con PLAY_SIGNING_SECRET. */
export const previewPayload = (versionId: string, expiresAt: number): string => `preview:${versionId}:${expiresAt}`

/** Motivo con que queda una publicación cortada por un reinicio de la API (se puede reintentar). */
export const INTERRUPTED_PUBLISH = 'La publicación se interrumpió porque la API se reinició. Reintenta.'
