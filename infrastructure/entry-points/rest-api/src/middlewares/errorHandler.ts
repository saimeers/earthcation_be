import type { ErrorRequestHandler, RequestHandler } from 'express'
import { DomainError, type ErrorKind } from '@earthcation/model'

// Único lugar que traduce errores a HTTP. v1 responde `{ error: mensaje }` como siempre; en v1 las reglas de
// negocio eran 400 (en v2 serán 422 con `{ error: { code, message } }`).
const V1_STATUS: Readonly<Record<ErrorKind, number>> = {
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  too_large: 413,
  business_rule: 400,
  unavailable: 503,
}

type HttpLikeError = { readonly status?: unknown; readonly statusCode?: unknown; readonly message?: unknown; readonly stack?: unknown }

// Errores de Express y sus parsers (JSON mal formado 400, cuerpo muy grande 413) traen su propio estado
const statusOf = (err: unknown): number => {
  if (err instanceof DomainError) return V1_STATUS[err.kind]
  const e = (err ?? {}) as HttpLikeError
  const status = typeof e.status === 'number' ? e.status : e.statusCode
  return typeof status === 'number' ? status : 500
}

const messageOf = (err: unknown): string => {
  const message = (err as HttpLikeError | null)?.message
  return typeof message === 'string' ? message : 'Error'
}

/** Los 4xx llevan un mensaje pensado para el usuario; un 5xx puede traer detalles internos y solo va al log. */
// eslint-disable-next-line max-params -- Express reconoce un manejador de errores por sus 4 parámetros
export const errorHandlerV1 = (log: (message: string) => void): ErrorRequestHandler => (err, _req, res, _next) => {
  const status = statusOf(err)
  if (status >= 500) {
    const stack = (err as HttpLikeError | null)?.stack
    log(`[ERROR] ${typeof stack === 'string' ? stack : messageOf(err)}`)
    res.status(status).json({ error: 'Error interno del servidor' })
    return
  }
  res.status(status).json({ error: messageOf(err) })
}

export const notFoundV1: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' })
}
