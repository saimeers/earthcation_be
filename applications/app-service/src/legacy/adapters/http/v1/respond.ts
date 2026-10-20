import type { Response } from 'express'
import { httpStatusOf, type DomainError } from '../../../shared/errors'
import type { Result } from '../../../shared/result'

// Borde HTTP de v1: un Err se responde como siempre lo hizo v1, `{ error: mensaje }` con su estado.
// Express 5 manda a `next` las promesas rechazadas, así que los fallos de infraestructura llegan al 500 genérico.
export const sendV1 = <T>(res: Response, result: Result<T, DomainError>, onOk: (value: T) => unknown): void => {
  if (result.ok) {
    onOk(result.value)
    return
  }
  res.status(httpStatusOf(result.error)).json({ error: result.error.message })
}

// Texto de la query (?name=...) o undefined si no viene o llega repetido
export const queryText = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)

export const body = (v: unknown): Readonly<Record<string, unknown>> =>
  v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {}
