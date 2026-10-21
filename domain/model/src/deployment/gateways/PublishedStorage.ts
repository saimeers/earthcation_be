import type { FileHeaders } from '../BuildInspection'

/**
 * Archivos sueltos que sirve el Worker de play.earthcation.saimers.dev: Cloudflare R2, o disco en desarrollo
 * (la API los sirve en /play-local). Las claves usan siempre "/" (builds/<id>/Build/x.wasm.br).
 */
export interface PublishedStorage {
  readonly kind: 'r2' | 'local'
  put(key: string, body: Uint8Array | string, headers: FileHeaders): Promise<void>
  /** Contenido del archivo, o null si no existe. */
  read(key: string): Promise<Uint8Array | null>
  removePrefix(prefix: string): Promise<void>
}
