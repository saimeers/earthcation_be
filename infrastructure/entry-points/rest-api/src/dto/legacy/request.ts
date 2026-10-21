import type { Request } from 'express'

/** Cuerpo JSON como objeto (vacío si no vino o no es un objeto): el dominio valida cada campo. */
export const bodyOf = (req: Request): Readonly<Record<string, unknown>> => {
  const body: unknown = req.body
  return body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {}
}

/** Texto de la query (?name=…) o undefined si no viene o llega repetido. */
export const queryText = (req: Request, name: string): string | undefined => {
  const value = req.query[name]
  return typeof value === 'string' && value !== '' ? value : undefined
}

export const pathParam = (req: Request, name: string): string => String(req.params[name])
