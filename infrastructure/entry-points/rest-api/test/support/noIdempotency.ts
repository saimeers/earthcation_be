import type { IdempotencyGuard } from '../../src'

/** Guardia que no recuerda nada: para las pruebas de rutas que no usan Idempotency-Key. */
export const noIdempotency: IdempotencyGuard = { run: (_req, handler) => handler() }
