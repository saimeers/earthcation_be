/**
 * Registro de auditoría: quién hizo qué sobre qué y cuándo. Solo se inserta; nunca se edita ni se borra desde la app
 * (la base de datos lo impide con un disparador).
 */

/** Acciones que se auditan. Un valor nuevo se agrega aquí y se declara en el contenedor. */
export const AUDIT_ACTIONS = [
  'auth.login_succeeded', 'auth.login_failed', 'auth.password_reset_requested', 'auth.password_reset_completed',
  'user.created', 'user.updated', 'user.enabled', 'user.disabled', 'user.imported', 'user.anonymized',
  'organization.created', 'organization.updated', 'organization.enabled', 'organization.disabled',
  'location.created', 'location.updated', 'location.enabled', 'location.disabled',
  'session.started', 'session.ended', 'session.exported',
  'game_version.created', 'game_version.completed', 'game_version.activated', 'game_version.removed',
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

/** Quién la hizo; null en acciones sin sesión (un login fallido, un restablecimiento). */
export interface AuditActor {
  readonly id: string
  readonly role: string
}

/** Desde dónde: la IP nunca se guarda, solo su huella (HMAC), igual que en las visitas. */
export interface AuditOrigin {
  readonly ipHash: string | null
  readonly userAgent: string | null
}

/** Lo que describe una acción; el actor y el origen los pone el decorador. */
export interface AuditDraft {
  readonly targetType: string
  readonly targetId: string | null
  /** Qué cambió, sin datos sensibles: nombres de campos y valores no personales (el rol, el estado). */
  readonly changes?: Readonly<Record<string, unknown>>
  /** Para acciones sin sesión (login) el actor sale del resultado, no de la petición. */
  readonly actor?: AuditActor
}

export interface AuditEntry extends AuditDraft {
  readonly action: AuditAction
  readonly actor: AuditActor | undefined
  readonly origin: AuditOrigin | null
  readonly occurredAt: Date
}

/** Un registro ya guardado. */
export interface AuditRecord {
  readonly id: string
  readonly occurredAt: Date
  readonly actorId: string | null
  readonly actorRole: string | null
  readonly action: string
  readonly targetType: string
  readonly targetId: string | null
  readonly changes: Readonly<Record<string, unknown>>
  readonly ipHash: string | null
  readonly userAgent: string | null
}
