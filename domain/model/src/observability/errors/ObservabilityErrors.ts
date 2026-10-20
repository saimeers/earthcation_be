import { UnauthorizedError } from '../../shared/errors/DomainError'

/** La ingesta de visitas llegó sin el secreto que comparte el Worker. */
export class IngestSecretInvalidError extends UnauthorizedError {
  constructor() { super('INGEST_SECRET_INVALID', 'No autorizado') }
}
