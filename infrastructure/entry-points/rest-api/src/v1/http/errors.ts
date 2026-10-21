import type { ErrorRequestHandler, RequestHandler, Response } from 'express'
import { DomainError, type ErrorKind } from '@earthcation/model'

// Errores de v1: `{ error: { code, message, details? } }` con un `code` estable en mayúsculas. A diferencia de v1,
// una regla de negocio incumplida es 422 (v1 la responde 400).
const STATUS: Readonly<Record<ErrorKind, number>> = {
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  too_large: 413,
  business_rule: 422,
  unavailable: 503,
}

type HttpLikeError = { readonly status?: unknown, readonly statusCode?: unknown, readonly message?: unknown, readonly stack?: unknown }

// Códigos de los errores que traen su propio estado (Express y sus parsers: JSON mal formado, cuerpo muy grande)
const CODE_BY_STATUS: Readonly<Record<number, string>> = { 400: 'MALFORMED_REQUEST', 413: 'PAYLOAD_TOO_LARGE', 429: 'RATE_LIMITED' }

const httpStatusOf = (err: unknown): number => {
  const e = (err ?? {}) as HttpLikeError
  const status = typeof e.status === 'number' ? e.status : e.statusCode
  return typeof status === 'number' ? status : 500
}

const messageOf = (err: unknown): string => {
  const message = (err as HttpLikeError | null)?.message
  return typeof message === 'string' ? message : 'Error'
}

const body = (code: string, message: string, details?: unknown) => ({ error: { code, message, ...(details !== undefined && { details }) } })

const respondDomain = (res: Response, err: DomainError): void => {
  res.status(STATUS[err.kind]).json(body(err.code, err.message, err.details))
}

/** Un 5xx puede traer detalles internos: solo va al log y el cliente recibe un mensaje genérico. */
const respondHttp = (res: Response, err: unknown, log: (message: string) => void): void => {
  const status = httpStatusOf(err)
  if (status < 500) {
    res.status(status).json(body(CODE_BY_STATUS[status] ?? 'BAD_REQUEST', messageOf(err)))
    return
  }
  const stack = (err as HttpLikeError | null)?.stack
  log(`[ERROR] ${typeof stack === 'string' ? stack : messageOf(err)}`)
  res.status(status).json(body('INTERNAL_ERROR', 'Error interno del servidor'))
}

// eslint-disable-next-line max-params -- Express reconoce un manejador de errores por sus 4 parámetros
export const errorHandlerV1 = (log: (message: string) => void): ErrorRequestHandler => (err, _req, res, _next) => {
  if (err instanceof DomainError) respondDomain(res, err)
  else respondHttp(res, err, log)
}

export const notFoundV1: RequestHandler = (_req, res) => {
  res.status(404).json(body('ROUTE_NOT_FOUND', 'Ruta no encontrada'))
}
