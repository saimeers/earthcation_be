/**
 * Clase de error de dominio que decide cómo responde la API: el dominio lanza subclases con un `code` estable
 * (en mayúsculas, para la API v2 y los clientes) y un `message` en español para el usuario; un único errorHandler
 * en rest-api traduce el `kind` a estado HTTP. Nada fuera de esta jerarquía llega como 4xx: lo demás es un 500.
 */
export type ErrorKind =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'too_large'
  | 'business_rule'
  | 'unavailable'

export abstract class DomainError extends Error {
  abstract readonly kind: ErrorKind

  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = new.target.name
  }
}

/** Dato de entrada inválido (400). */
export class ValidationError extends DomainError {
  readonly kind = 'validation'
}

/** Sin credenciales válidas (401). */
export class UnauthorizedError extends DomainError {
  readonly kind = 'unauthorized'
}

/** Autenticado pero sin permiso sobre el recurso (403). */
export class ForbiddenError extends DomainError {
  readonly kind = 'forbidden'
}

/** El recurso no existe (404). */
export class NotFoundError extends DomainError {
  readonly kind = 'not_found'
}

/** Choca con el estado actual: duplicado o transición no permitida (409). */
export class ConflictError extends DomainError {
  readonly kind = 'conflict'
}

/** Archivo o carga más grande de lo permitido (413). */
export class TooLargeError extends DomainError {
  readonly kind = 'too_large'
}

/** Regla de negocio que impide la operación (v1: 400; v2: 422). */
export class BusinessRuleError extends DomainError {
  readonly kind = 'business_rule'
}

/** Falta configuración o un servicio externo no responde (503). */
export class UnavailableError extends DomainError {
  readonly kind = 'unavailable'
}
