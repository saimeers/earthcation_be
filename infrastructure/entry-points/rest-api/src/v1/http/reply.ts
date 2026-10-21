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
  /** 200 por defecto; 201 con `location` al crear; 202 si se aceptó y se procesará; 204 sin cuerpo. */
  readonly status?: number
  readonly data?: unknown
  readonly meta?: PageMeta
  /** Ruta del recurso creado (cabecera `Location`). */
  readonly location?: string
  /** Cuerpo binario (p. ej. el informe en Excel) en lugar del JSON. */
  readonly file?: { readonly contentType: string, readonly filename: string, readonly content: Uint8Array }
}

export const ok = (data: unknown): Reply => ({ data })

export const page = (data: readonly unknown[], meta: PageMeta): Reply => ({ data, meta })

export const created = (location: string, data: unknown): Reply => ({ status: 201, data, location })

export const accepted = (data: unknown): Reply => ({ status: 202, data })

export const file = (contentType: string, filename: string, content: Uint8Array): Reply => ({ file: { contentType, filename, content } })

export const noContent = (): Reply => ({ status: 204 })

const sendFile = (res: Response, f: NonNullable<Reply['file']>): void => {
  res.setHeader('Content-Type', f.contentType)
  res.setHeader('Content-Disposition', `attachment; filename="${f.filename}"`)
  res.end(f.content)
}

const sendJson = (res: Response, reply: Reply): void => {
  const status = reply.status ?? 200
  if (reply.location) res.location(reply.location)
  if (status === 204) res.status(status).end()
  else res.status(status).json(reply.meta ? { data: reply.data, meta: reply.meta } : { data: reply.data })
}

export const send = (res: Response, reply: Reply): void => {
  if (reply.file) sendFile(res, reply.file)
  else sendJson(res, reply)
}
