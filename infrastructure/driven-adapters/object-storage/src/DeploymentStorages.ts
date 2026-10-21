import path from 'node:path'
import { S3Client } from '@aws-sdk/client-s3'
import type { FileHeaders, OriginalsStorage, PublishedStorage } from '@earthcation/model'
import { LocalFolder } from './LocalFolder'
import { S3Bucket } from './S3Bucket'

// Almacenamiento del despliegue del juego, en dos lugares:
// - originales: el ZIP tal como lo subió el desarrollador (respaldo para republicar). AWS S3 si hay bucket; si no, disco.
// - publicados: los archivos sueltos que sirve el Worker de play.earthcation.saimers.dev. Cloudflare R2 si hay
//   bucket; si no, disco, y la API los sirve en /play-local (desarrollo).
// La configuración la lee y valida app-service (config/env.ts), nunca este paquete.

export interface BucketCredentials {
  readonly accessKeyId?: string
  readonly secretAccessKey?: string
}

export interface S3Config extends BucketCredentials {
  readonly bucket: string
  readonly region: string
}

export interface R2Config extends BucketCredentials {
  readonly bucket: string
  readonly accountId?: string
}

export interface DeploymentStorageConfig {
  /** Carpeta local cuando falta S3 o R2 (DEPLOY_LOCAL_DIR). */
  readonly localDir: string
  readonly s3?: S3Config
  readonly r2?: R2Config
}

// Sin llaves explícitas el SDK usa su cadena de credenciales por defecto
const credentialsOf = (c: BucketCredentials) => (c.accessKeyId && c.secretAccessKey
  ? { credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey } }
  : {})

/** Originales en AWS S3: el panel sube el ZIP directo con una URL prefirmada. */
export class S3OriginalsStorage implements OriginalsStorage {
  readonly kind = 's3'
  private readonly bucket: S3Bucket

  constructor(config: S3Config) {
    this.bucket = new S3Bucket(new S3Client({ region: config.region, ...credentialsOf(config) }), config.bucket)
  }

  put(key: string, body: Uint8Array) { return this.bucket.put(key, body) }
  read(key: string) { return this.bucket.read(key) }
  size(key: string) { return this.bucket.size(key) }
  remove(key: string) { return this.bucket.remove(key) }
  presignPut(key: string, contentLength: number) { return this.bucket.presignPut(key, contentLength) }
}

/** Originales en disco (desarrollo): el ZIP llega por la API. */
export class LocalOriginalsStorage implements OriginalsStorage {
  readonly kind = 'local'
  private readonly folder: LocalFolder

  constructor(root: string) { this.folder = new LocalFolder(path.join(path.resolve(root), 'originals')) }

  put(key: string, body: Uint8Array) { return this.folder.put(key, body) }
  read(key: string) { return this.folder.read(key) }
  size(key: string) { return this.folder.size(key) }
  remove(key: string) { return this.folder.remove(key) }
  presignPut(): Promise<string> { return Promise.reject(new Error('Sin S3 no hay URL prefirmada')) }
}

/** Publicados en Cloudflare R2 (API de S3), servidos por el Worker. */
export class R2PublishedStorage implements PublishedStorage {
  readonly kind = 'r2'
  private readonly bucket: S3Bucket

  constructor(config: R2Config) {
    const endpoint = `https://${config.accountId ?? ''}.r2.cloudflarestorage.com`
    this.bucket = new S3Bucket(new S3Client({ region: 'auto', endpoint, ...credentialsOf(config) }), config.bucket)
  }

  put(key: string, body: Uint8Array | string, headers: FileHeaders) { return this.bucket.put(key, body, headers) }
  read(key: string) { return this.bucket.readIfExists(key) }
  removePrefix(prefix: string) { return this.bucket.removePrefix(prefix) }
}

/** Publicados en disco (desarrollo): la API los sirve en /play-local. */
export class LocalPublishedStorage implements PublishedStorage {
  readonly kind = 'local'
  private readonly folder: LocalFolder

  constructor(root: string) { this.folder = new LocalFolder(path.join(path.resolve(root), 'published')) }

  put(key: string, body: Uint8Array | string) { return this.folder.put(key, body) }
  read(key: string) { return this.folder.readIfExists(key) }
  removePrefix(prefix: string) { return this.folder.remove(prefix) }
}

/** Cada almacenamiento cae a disco por separado si falta su bucket. */
export const createDeploymentStorages = (c: DeploymentStorageConfig) => ({
  originals: c.s3 ? new S3OriginalsStorage(c.s3) : new LocalOriginalsStorage(c.localDir),
  published: c.r2 ? new R2PublishedStorage(c.r2) : new LocalPublishedStorage(c.localDir),
}) satisfies { originals: OriginalsStorage; published: PublishedStorage }
