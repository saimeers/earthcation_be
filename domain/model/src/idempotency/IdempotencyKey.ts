import { IdempotencyKeyInvalidError } from './errors'

const SHAPE = /^[A-Za-z0-9._:-]{8,128}$/

/** Clave de idempotencia que manda el cliente (cabecera `Idempotency-Key`): un UUID basta. */
export class IdempotencyKey {
  private constructor(readonly value: string) {}

  static of(raw: unknown): IdempotencyKey {
    if (typeof raw !== 'string' || !SHAPE.test(raw)) throw new IdempotencyKeyInvalidError()
    return new IdempotencyKey(raw)
  }
}
