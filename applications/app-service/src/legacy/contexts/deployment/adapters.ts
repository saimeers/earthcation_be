import { createHmac, randomUUID } from 'node:crypto'
import AdmZip from 'adm-zip'
import { getOriginals, getPublished } from '../../config/deployStorage'
import type { ZipEntry } from './build'
import type { DeployConfig, Originals, PublishedStore, Storage } from './ports'

// Adaptadores del despliegue: almacenamiento (S3/R2 o disco, config/deployStorage.js), ZIP, firma HMAC,
// configuración del entorno y la cola de publicación en memoria.

type Driver = {
  readonly driver: string
  readonly put: (key: string, body: Buffer | string, headers?: object) => Promise<void>
  readonly getBuffer: (key: string) => Promise<Buffer>
  readonly size: (key: string) => Promise<number | null>
  readonly remove: (key: string) => Promise<void>
  readonly removePrefix: (prefix: string) => Promise<void>
  readonly presignPut?: (key: string, contentLength: number) => Promise<string>
}

const noPresign = (): Promise<string> => Promise.reject(new Error('Sin S3 no hay URL prefirmada'))

const originals = (): Originals => {
  const o = getOriginals() as Driver
  return {
    driver: o.driver === 's3' ? 's3' : 'local',
    put: (key, body) => o.put(key, body), getBuffer: (key) => o.getBuffer(key), size: (key) => o.size(key),
    remove: (key) => o.remove(key), presignPut: o.presignPut ? o.presignPut.bind(o) : noPresign,
  }
}

const published = (): PublishedStore => {
  const p = getPublished() as Driver
  return { driver: p.driver === 'r2' ? 'r2' : 'local', put: (key, body, headers) => p.put(key, body, headers), removePrefix: (prefix) => p.removePrefix(prefix) }
}

export const storage: Storage = { originals, published }

export const config: DeployConfig = {
  maxMb: () => Number(process.env.DEPLOY_MAX_MB) || 500,
  playUrl: () => (process.env.PLAY_URL || 'https://play.earthcation.saimers.dev').replace(/\/+$/, ''),
  signingSecret: () => process.env.PLAY_SIGNING_SECRET || undefined,
}

const entriesOf = (zip: Buffer): readonly ZipEntry[] =>
  new AdmZip(zip).getEntries().map((e) => ({ name: e.entryName, isDirectory: e.isDirectory, read: () => e.getData() }))

export const readZip = (zip: Buffer): readonly ZipEntry[] | null => {
  try {
    return entriesOf(zip)
  } catch {
    return null
  }
}

export const sign = (secret: string, payload: string): string => createHmac('sha256', secret).update(payload).digest('base64url')

export const newId = (): string => randomUUID()

// Publicaciones de a una, en el orden en que se completaron. Única pieza con estado del contexto.
const queue = { tail: Promise.resolve() }

export const enqueue = (task: () => Promise<void>): void => {
  // eslint-disable-next-line functional/immutable-data -- la cola en memoria es el borde con estado
  queue.tail = queue.tail.then(task).catch(() => undefined)
}
