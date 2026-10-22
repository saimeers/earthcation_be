import type { AuditActor, AuditOrigin } from '../AuditEntry'

export interface RequestScope {
  readonly origin: AuditOrigin | null
  readonly actor: AuditActor | null
}

/**
 * Puerto de salida: quién está haciendo la petición en curso. La entrada HTTP abre el ámbito al llegar la petición
 * y `authenticate` le pone el actor; así los casos de uso pueden auditarse sin recibir al usuario en cada comando.
 */
export interface RequestContext {
  /** Ejecuta `work` con un ámbito nuevo (sin actor todavía). */
  run<T>(origin: AuditOrigin | null, work: () => T): T
  setActor(actor: AuditActor): void
  /** null fuera de una petición (arranque, tareas). */
  current(): RequestScope | null
}
