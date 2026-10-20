import {
  DeleteObjectCommand, DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { FileHeaders } from '@earthcation/model'

const PRESIGN_EXPIRES_S = 900

const statusOf = (e: unknown): unknown => (e as { $metadata?: { httpStatusCode?: unknown } } | null)?.$metadata?.httpStatusCode
const isMissing = (e: unknown): boolean => statusOf(e) === 404 || (e as { name?: unknown } | null)?.name === 'NoSuchKey'

/** Un bucket con API de S3 (AWS S3 o Cloudflare R2). */
export class S3Bucket {
  constructor(private readonly client: S3Client, private readonly bucket: string) {}

  async put(key: string, body: Uint8Array | string, headers?: FileHeaders): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket, Key: key, Body: body,
      ContentType: headers?.contentType, ContentEncoding: headers?.contentEncoding, CacheControl: headers?.cacheControl,
    }))
  }

  async read(key: string): Promise<Uint8Array> {
    const { Body } = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
    if (!Body) throw new Error(`Objeto vacío: ${key}`)
    return Body.transformToByteArray()
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
      return (await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))).ContentLength ?? null
    } catch (e) {
      if (isMissing(e)) return null
      throw e
    }
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }

  /** Borra todo lo que empieza por el prefijo, de a una página del listado. */
  async removePrefix(prefix: string): Promise<void> {
    let token: string | undefined
    do {
      const page = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }))
      await this.removeKeys((page.Contents ?? []).map((o) => ({ Key: o.Key })))
      token = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (token)
  }

  /** Subida directa desde el navegador: el ZIP no pasa por la API. */
  presignPut(key: string, contentLength: number): Promise<string> {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: 'application/zip', ContentLength: contentLength })
    return getSignedUrl(this.client, command, { expiresIn: PRESIGN_EXPIRES_S })
  }

  private async removeKeys(keys: { Key: string | undefined }[]): Promise<void> {
    if (keys.length === 0) return
    await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys, Quiet: true } }))
  }
}
