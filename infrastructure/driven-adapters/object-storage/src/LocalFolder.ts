import fs from 'node:fs/promises'
import path from 'node:path'

const isMissing = (e: unknown): boolean => (e as { code?: unknown } | null)?.code === 'ENOENT'

/** Carpeta en disco direccionada por claves con "/" (desarrollo, sin S3 ni R2). */
export class LocalFolder {
  constructor(private readonly base: string) {}

  /** Ruta en disco de una clave; nunca fuera de la carpeta. */
  full(key: string): string {
    const p = path.join(this.base, ...key.split('/'))
    if (!p.startsWith(this.base)) throw new Error('Ruta fuera del almacenamiento local')
    return p
  }

  async put(key: string, body: Uint8Array | string): Promise<void> {
    await fs.mkdir(path.dirname(this.full(key)), { recursive: true })
    await fs.writeFile(this.full(key), body)
  }

  async read(key: string): Promise<Uint8Array> {
    return fs.readFile(this.full(key))
  }

  async readIfExists(key: string): Promise<Uint8Array | null> {
    try {
      return await this.read(key)
    } catch (e) {
      if (isMissing(e)) return null
      throw e
    }
  }

  async size(key: string): Promise<number | null> {
    try {
      return (await fs.stat(this.full(key))).size
    } catch {
      return null
    }
  }

  async remove(key: string): Promise<void> {
    await fs.rm(this.full(key), { recursive: true, force: true })
  }
}
