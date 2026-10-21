import { BusinessRuleError, ConflictError, ValidationError } from '../shared/errors/DomainError'

export class IdempotencyKeyInvalidError extends ValidationError {
  constructor() { super('IDEMPOTENCY_KEY_INVALID', 'La cabecera Idempotency-Key debe tener entre 8 y 128 caracteres: letras, números y . _ : -') }
}

/** La misma clave con otra petición: el cliente reutilizó la clave de un intento distinto. */
export class IdempotencyKeyReusedError extends BusinessRuleError {
  constructor() { super('IDEMPOTENCY_KEY_REUSED', 'Esa Idempotency-Key ya se usó con otra petición') }
}

/** La primera petición con esta clave sigue ejecutándose: se reintenta en unos segundos. */
export class IdempotencyInProgressError extends ConflictError {
  constructor() { super('IDEMPOTENCY_IN_PROGRESS', 'Hay una petición con esta Idempotency-Key en curso; reintenta en unos segundos') }
}
