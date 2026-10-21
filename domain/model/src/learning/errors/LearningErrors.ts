import { NotFoundError, ValidationError } from '../../shared/errors/DomainError'

export class AttemptNotFoundError extends NotFoundError {
  constructor() { super('ATTEMPT_NOT_FOUND', 'Intento no encontrado') }
}

export class LevelNotFoundError extends NotFoundError {
  constructor() { super('LEVEL_NOT_FOUND', 'Nivel no encontrado') }
}

export class RiskNotFoundError extends NotFoundError {
  constructor() { super('RISK_NOT_FOUND', 'Riesgo no encontrado') }
}

export class RiskRequiredError extends ValidationError {
  constructor() { super('RISK_REQUIRED', 'risk_id es requerido') }
}

export class LevelKeyRequiredError extends ValidationError {
  constructor() { super('LEVEL_KEY_REQUIRED', 'level_key es requerido') }
}

export class AttemptRequiredError extends ValidationError {
  constructor() { super('ATTEMPT_REQUIRED', 'attempt_id es requerido') }
}

export class EventsRequiredError extends ValidationError {
  constructor() { super('EVENTS_REQUIRED', 'events debe ser un arreglo no vacío') }
}

export class EventTypeRequiredError extends ValidationError {
  constructor() { super('EVENT_TYPE_REQUIRED', 'cada evento requiere event_type') }
}
