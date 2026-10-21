/**
 * ZIP tal como lo subió el desarrollador (respaldo para republicar): AWS S3, o disco en desarrollo.
 * Las claves usan siempre "/" (originals/<id>.zip), también en disco.
 */
export interface OriginalsStorage {
  readonly kind: 's3' | 'local'
  put(key: string, body: Uint8Array): Promise<void>
  read(key: string): Promise<Uint8Array>
  /** Bytes del objeto, o null si no existe. */
  size(key: string): Promise<number | null>
  remove(key: string): Promise<void>
  /** URL prefirmada para que el navegador suba el ZIP directo, sin pasar por la API (solo S3). */
  presignPut(key: string, contentLength: number): Promise<string>
}
