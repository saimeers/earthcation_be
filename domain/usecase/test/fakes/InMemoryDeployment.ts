import {
  GameVersion,
  type FileHeaders, type GameVersionListing, type GameVersionRepository, type NewGameVersion, type OriginalsStorage,
  type PublishedStorage, type PublishQueue, type VersionStatus, type ZipEntry, type ZipReader,
} from '@earthcation/model'

/** Repositorio en memoria de versiones del juego (con el puntero a la activa). */
export class InMemoryGameVersionRepository implements GameVersionRepository {
  readonly rows = new Map<string, GameVersion>()
  active: string | null = null

  /** Cada lectura es otra instancia, como al leer de la BD. */
  findById(id: string) {
    const stored = this.rows.get(id)
    return Promise.resolve(stored ? GameVersion.restore(stored.toProps()) : null)
  }

  list(): Promise<GameVersionListing[]> {
    return Promise.resolve([...this.rows.values()].reverse().map((version) => ({ version, uploader: null })))
  }

  activeId() { return Promise.resolve(this.active) }

  create(v: NewGameVersion) {
    const created = GameVersion.restore({
      ...v, status: 'uploading', publishedPrefix: null, manifest: null, error: null, publishedAt: null, activatedAt: null,
      createdAt: new Date(0), updatedAt: new Date(0),
    })
    this.rows.set(v.id, created)
    return Promise.resolve(created)
  }

  saveNotes(v: GameVersion) {
    const stored = this.rows.get(v.id)
    if (stored) stored.describe(v.notes)
    return Promise.resolve()
  }

  /** Cambio condicional: solo si la fila guardada sigue en `from`. */
  startProcessing(v: GameVersion, from: VersionStatus) {
    const stored = this.rows.get(v.id)
    if (stored?.status !== from) return Promise.resolve(false)
    this.rows.set(v.id, GameVersion.restore(v.toProps()))
    return Promise.resolve(true)
  }

  save(v: GameVersion) { this.rows.set(v.id, GameVersion.restore(v.toProps())); return Promise.resolve() }

  failInterrupted(reason: string) {
    for (const v of this.rows.values()) if (v.status === 'processing') v.markFailed(reason)
    return Promise.resolve()
  }

  remove(id: string) { this.rows.delete(id); return Promise.resolve() }

  async activate(v: GameVersion, writePointer: () => Promise<void>) {
    await writePointer()
    this.active = v.id
    this.rows.set(v.id, GameVersion.restore(v.toProps()))
  }
}

/** Originales en memoria; kind 's3' firma URLs falsas. */
export class InMemoryOriginals implements OriginalsStorage {
  readonly files = new Map<string, Uint8Array>()
  constructor(readonly kind: 's3' | 'local' = 'local') {}
  put(key: string, body: Uint8Array) { this.files.set(key, body); return Promise.resolve() }
  read(key: string) { const f = this.files.get(key); return f ? Promise.resolve(f) : Promise.reject(new Error(`ENOENT ${key}`)) }
  size(key: string) { return Promise.resolve(this.files.get(key)?.length ?? null) }
  remove(key: string) { this.files.delete(key); return Promise.resolve() }
  presignPut(key: string, contentLength: number) { return Promise.resolve(`https://s3/${key}?len=${contentLength}`) }
}

/** Publicados en memoria, con los headers de cada archivo. */
export class InMemoryPublished implements PublishedStorage {
  readonly files = new Map<string, { body: Uint8Array | string; headers: FileHeaders }>()
  constructor(readonly kind: 'r2' | 'local' = 'local') {}
  put(key: string, body: Uint8Array | string, headers: FileHeaders) { this.files.set(key, { body, headers }); return Promise.resolve() }
  read(key: string) {
    const f = this.files.get(key)
    return Promise.resolve(f === undefined ? null : typeof f.body === 'string' ? new TextEncoder().encode(f.body) : f.body)
  }
  removePrefix(prefix: string) {
    for (const k of this.files.keys()) if (k.startsWith(prefix)) this.files.delete(k)
    return Promise.resolve()
  }
}

/** Guarda los ids encolados; `drain` los publica con el handler dado. */
export class ManualQueue implements PublishQueue {
  readonly pending: string[] = []
  enqueue(versionId: string) { this.pending.push(versionId) }
  async drain(run: (id: string) => Promise<void>) {
    for (const id of this.pending.splice(0)) await run(id)
  }
}

const text = (s: string) => new TextEncoder().encode(s)
export const entry = (name: string, content = name): ZipEntry => ({ name, isDirectory: false, size: content.length, read: () => text(content) })
export const webglEntries = (): ZipEntry[] => [
  entry('index.html', 'productVersion: "1.0"'),
  ...['x.loader.js', 'x.framework.js.br', 'x.wasm.br', 'x.data.br'].map((f) => entry(`Build/${f}`)),
]

/** "ZIP" de prueba: el texto 'zip' abre un build válido, 'sin-wasm' uno incompleto y lo demás no es ZIP. */
export const fakeZips: ZipReader = {
  read: (zip) => {
    const content = new TextDecoder().decode(zip)
    if (content === 'zip') return webglEntries()
    return content === 'sin-wasm' ? webglEntries().filter((e) => !e.name.includes('wasm')) : null
  },
}
