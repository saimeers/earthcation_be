import { ForbiddenError, UnauthorizedError } from '../../shared/errors/DomainError'

export class TokenRequiredError extends UnauthorizedError {
  constructor() { super('TOKEN_REQUIRED', 'Token de autenticación requerido') }
}

// v1 responde 403 (no 401) a un token inválido o vencido; se conserva
export class InvalidTokenError extends ForbiddenError {
  constructor() { super('TOKEN_INVALID', 'Token inválido o expirado') }
}

export class RoleNotAllowedError extends ForbiddenError {
  constructor() { super('ROLE_NOT_ALLOWED', 'No tienes permiso para esta acción') }
}
