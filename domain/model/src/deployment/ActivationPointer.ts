import type { FileHeaders } from './BuildInspection'
import type { GameVersion } from './GameVersion'

// Puntero que lee el Worker para servir la versión activa: current.json en el almacenamiento publicado.

const KEY = 'current.json'
const HEADERS: FileHeaders = { contentType: 'application/json', cacheControl: 'no-cache' }

/** Contenido del puntero para una versión recién activada. */
const of = (v: GameVersion): string =>
  JSON.stringify({ version_id: v.id, label: v.label, prefix: v.publishedPrefix, activated_at: v.activatedAt })

/** Carpeta de la versión activa según el puntero, o null si no hay puntero válido. */
const prefixOf = (text: string): string | null => {
  try {
    const pointer = JSON.parse(text) as { prefix?: unknown } | null
    return typeof pointer?.prefix === 'string' ? pointer.prefix : null
  } catch {
    return null
  }
}

export const ActivationPointer = { key: KEY, headers: HEADERS, of, prefixOf } as const
