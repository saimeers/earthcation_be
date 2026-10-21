import { z } from 'zod'
import type { PageMeta } from './reply'

export const MAX_LIMIT = 100

/** Parámetros comunes de todos los listados de v1: `?page=1&limit=20&sort=-createdAt`. */
export const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1).describe('Número de página, desde 1'),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(20).describe('Elementos por página (máximo 100)'),
  sort: z.string().optional().describe('Campo de orden; con prefijo "-" es descendente, p. ej. -createdAt'),
})

export type ListQuery = z.infer<typeof listQuery>

/** Corta una lista en páginas; `total` es el de la lista completa. */
export const paginate = <T>(items: readonly T[], { page, limit }: Pick<ListQuery, 'page' | 'limit'>): { items: T[], meta: PageMeta } => ({
  items: items.slice((page - 1) * limit, page * limit),
  meta: { page, limit, total: items.length, totalPages: Math.max(1, Math.ceil(items.length / limit)) },
})

const isNil = (v: unknown): v is null | undefined => v === null || v === undefined

const toText = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '')

// Los valores vacíos van al final; el resto se compara como texto en español, con números naturales (2 < 10)
const compare = (a: unknown, b: unknown): number => {
  if (isNil(a) || isNil(b)) return Number(isNil(a)) - Number(isNil(b))
  return toText(a).localeCompare(toText(b), 'es', { numeric: true })
}

/** Ordena por un campo permitido (`sort=name` o `sort=-name`); un campo que no está en `allowed` se ignora. */
export const sortBy = <T extends object>(items: readonly T[], sort: string | undefined, allowed: readonly (keyof T & string)[]): T[] => {
  const descending = sort?.startsWith('-') ?? false
  const field = allowed.find((f) => f === sort?.replace(/^-/, ''))
  if (!field) return [...items]
  return [...items].sort((a, b) => (descending ? -1 : 1) * compare(a[field], b[field]))
}
