import { NotFoundError, ValidationError } from '../../shared/errors/DomainError'

export class VarkAnswersRequiredError extends ValidationError {
  constructor() { super('VARK_ANSWERS_REQUIRED', 'Se requiere el objeto answers') }
}

export class InvalidVarkStyleError extends ValidationError {
  constructor(styles: readonly string[]) { super('VARK_INVALID_STYLE', `Estilo inválido. Usa: ${styles.join(', ')}`) }
}

export class VarkResultNotFoundError extends NotFoundError {
  constructor() { super('VARK_NOT_FOUND', 'No hay resultado VARK para este usuario') }
}
