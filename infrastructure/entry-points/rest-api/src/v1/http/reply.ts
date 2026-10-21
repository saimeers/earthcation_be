import type { Response } from 'express'

/** Metadatos de paginación (`meta` de un listado). */
export interface PageMeta {
  readonly page: number
  readonly limit: number
  readonly total: number
  readonly totalPages: number
}

/** Lo que devuelve un handler de v1; `send` lo traduce al sobre `{ data, meta }` y al estado HTTP. */
export interface Reply {
  /** 200 por defecto; 201 con `location` al crear; 204 sin cuerpo. */
  readonly status?: 200 | 201 | 204
  readonly data?: unknown
  readonly meta?: PageMeta
  /** Ruta del recurso creado (cabecera `Location`). */
  readonly location?: string
}

export const ok = (data: unknown): Reply => ({ data })

export const page = (data: readonly unknown[], meta: PageMeta): Reply => ({ data, meta })

export const created = (location: string, data: unknown): Reply => ({ status: 201, data, location })

export const noContent = (): Reply => ({ status: 204 })

export const send = (res: Response, reply: Reply): void => {
  const status = reply.status ?? 200
  if (reply.location) res.location(reply.location)
  if (status === 204) res.status(status).end()
  else res.status(status).json(reply.meta ? { data: reply.data, meta: reply.meta } : { data: reply.data })
}
