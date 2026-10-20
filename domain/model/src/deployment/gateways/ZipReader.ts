import type { ZipEntry } from '../BuildInspection'

/** Abre un ZIP; null si el archivo no es un ZIP. */
export interface ZipReader {
  read(zip: Uint8Array): readonly ZipEntry[] | null
}
