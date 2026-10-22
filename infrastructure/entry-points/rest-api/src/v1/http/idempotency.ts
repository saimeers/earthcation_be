import { createHash } from 'node:crypto'
import type { Request } from 'express'
import { IdempotencyKey, TokenRequiredError, type IdempotencyClaim, type StoredReply } from '@earthcation/model'
import type { IdempotentExecutor } from '@earthcation/usecase'
import type { Reply } from './reply'

export const IDEMPOTENCY_HEADER = 'Idempotency-Key'

/** Corre el handler de una ruta idempotente: con `Idempotency-Key`, un reintento recibe la respuesta guardada. */
export interface IdempotencyGuard {
  run(req: Request, handler: () => Promise<Reply>): Promise<Reply>
}

// JSON con las claves ordenadas: el mismo cuerpo con otro orden de campos tiene la misma huella
const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]))
}

/** Huella de la petición: método, ruta y cuerpo. La misma clave con otra huella es un uso indebido de la clave. */
export const fingerprintOf = (req: Request): string =>
  createHash('sha256').update(`${req.method} ${req.baseUrl}${req.path}\n${JSON.stringify(stable(req.body ?? {}))}`).digest('hex')

const claimOf = (req: Request, key: IdempotencyKey): IdempotencyClaim => {
  if (!req.user) throw new TokenRequiredError()
  return { userId: req.user.id, key: key.value, fingerprint: fingerprintOf(req) }
}

const stored = (reply: Reply): StoredReply => ({ status: reply.status ?? 200, data: reply.data, ...(reply.location && { location: reply.location }) })

export const createIdempotencyGuard = (executor: IdempotentExecutor): IdempotencyGuard => ({
  async run(req, handler) {
    const raw = req.get(IDEMPOTENCY_HEADER)
    if (raw === undefined) return handler()
    const { reply, replayed } = await executor.execute(claimOf(req, IdempotencyKey.of(raw)), async () => stored(await handler()))
    return { ...reply, ...(replayed && { headers: { 'Idempotent-Replayed': 'true' } }) }
  },
})
