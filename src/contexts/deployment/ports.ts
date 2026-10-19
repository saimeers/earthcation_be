import type { FileHeaders, ZipEntry } from './build'
import type { NewVersion, Published, Version } from './domain'

type Fields = Readonly<Record<string, unknown>>

// Versión tal como la ve el panel por v1 (columnas snake_case, con quien la subió en el listado)
export type VersionView = Fields

export type VersionRepository = {
  readonly find: (id: string) => Promise<Version | null>
  readonly view: (id: string) => Promise<VersionView | null>
  readonly list: () => Promise<readonly VersionView[]>
  readonly create: (id: string, v: NewVersion & { readonly s3Key: string; readonly uploadedBy: string }) => Promise<VersionView>
  // Cambio atómico desde el estado leído: false si otro clic (u otra instancia) se adelantó
  readonly startProcessing: (id: string, from: Version['status'], sizeBytes: number) => Promise<boolean>
  readonly markReady: (id: string, p: Published) => Promise<void>
  readonly markFailed: (id: string, error: string) => Promise<void>
  readonly failInterrupted: (reason: string) => Promise<void>
  readonly remove: (id: string) => Promise<void>
  readonly activeId: () => Promise<string | null>
  // Puntero + fecha de activación en una transacción; si writePointer falla, nada cambia
  readonly activate: (id: string, at: Date, writePointer: () => Promise<void>) => Promise<void>
}

export type Originals = {
  readonly driver: 's3' | 'local'
  readonly put: (key: string, body: Buffer) => Promise<void>
  readonly getBuffer: (key: string) => Promise<Buffer>
  readonly size: (key: string) => Promise<number | null>
  readonly remove: (key: string) => Promise<void>
  readonly presignPut: (key: string, contentLength: number) => Promise<string>
}

export type PublishedStore = {
  readonly driver: 'r2' | 'local'
  readonly put: (key: string, body: Buffer | string, headers: FileHeaders) => Promise<void>
  readonly removePrefix: (prefix: string) => Promise<void>
}

export type Storage = { readonly originals: () => Originals; readonly published: () => PublishedStore }

export type DeployConfig = {
  readonly maxMb: () => number
  readonly playUrl: () => string
  readonly signingSecret: () => string | undefined
}

export type DeploymentDeps = {
  readonly versions: VersionRepository
  readonly storage: Storage
  readonly config: DeployConfig
  readonly readZip: (zip: Buffer) => readonly ZipEntry[] | null // null si no es un ZIP
  readonly sign: (secret: string, payload: string) => string
  readonly enqueue: (task: () => Promise<void>) => void
  readonly newId: () => string
  readonly now: () => number
  readonly log: { readonly info: (m: string) => void; readonly error: (m: string) => void }
}
