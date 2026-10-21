import { BusinessRuleError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors/DomainError'

export class SessionNotFoundError extends NotFoundError {
  constructor() { super('SESSION_NOT_FOUND', 'Sesión no encontrada') }
}

export class SessionCodeInvalidError extends NotFoundError {
  constructor() { super('SESSION_CODE_INVALID', 'Código de sesión inválido') }
}

export class SessionCodeNotLiveError extends NotFoundError {
  constructor() { super('SESSION_CODE_NOT_LIVE', 'Código de sesión inválido o la sesión ya finalizó') }
}

export class NotAParticipantError extends NotFoundError {
  constructor() { super('NOT_A_PARTICIPANT', 'El usuario no participa en esta sesión') }
}

export class SessionForbiddenError extends ForbiddenError {
  constructor() { super('SESSION_FORBIDDEN', 'Sesión no encontrada o sin permiso') }
}

/** Regla de negocio de estado (v1 respondía 400, igual que `ValidationError`: mismo estado con `BusinessRuleError`). */
export class SessionFinishedError extends BusinessRuleError {
  constructor() { super('SESSION_FINISHED', 'Esta sesión ya ha finalizado') }
}

export class FreePlayLockedError extends BusinessRuleError {
  constructor() { super('FREE_PLAY_LOCKED', 'La sesión de juego libre siempre está activa') }
}

export class SessionNameRequiredError extends ValidationError {
  constructor() { super('SESSION_NAME_REQUIRED', 'El nombre de la sesión es requerido') }
}

export class SessionLocationRequiredError extends ValidationError {
  constructor() { super('SESSION_LOCATION_REQUIRED', 'La localidad (location_id) es requerida') }
}

export class SessionCodeRequiredError extends ValidationError {
  constructor() { super('SESSION_CODE_REQUIRED', 'El código es requerido') }
}

export class SessionCodeFormatError extends ValidationError {
  constructor() { super('SESSION_CODE_FORMAT', 'El código de sala tiene 3 dígitos') }
}
