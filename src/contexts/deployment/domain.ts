import { conflict, notFound, tooLarge, validation, type DomainError } from '../../shared/errors'
import { err, ok, type Result } from '../../shared/result'
import type { Manifest } from './build'

// Despliegue del juego WebGL (desarrollador y admin):
// 1. crear versión → 'uploading' + adónde subir el ZIP (URL prefirmada de S3, o la API en desarrollo);
// 2. completar → 'processing' y se encola la publicación;
// 3. publicar en segundo plano (de a una): validar el ZIP y subir cada archivo a builds/<id>/ → 'ready' o 'failed';
// 4. activar escribe current.json, el puntero que lee el Worker. Rollback = activar otra versión.

export type Status = 'uploading' | 'processing' | 'ready' | 'failed'

export type Version = {
  readonly id: string
  readonly label: string
  readonly status: Status
  readonly s3Key: string | null
  readonly r2Prefix: string | null
  readonly manifest: Readonly<Record<string, unknown>> | null
  readonly activatedAt: Date | null
}

export type NewVersion = { readonly label: string; readonly notes: string | null; readonly sizeBytes: number }

const LABEL = /^[\w.\- ]{1,40}$/

export const versionNotFound = (): DomainError => notFound('VERSION_NOT_FOUND', 'Versión no encontrada')

const invalidLabel = (): DomainError =>
  validation('VERSION_LABEL_INVALID', 'Versión inválida: usa letras, números, punto o guion (máx. 40)')
const sizeRequired = (): DomainError => validation('VERSION_SIZE_REQUIRED', 'size_bytes es requerido')

const notesOf = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, 2000) : null)

const labelOf = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '')

export const toNewVersion = (b: Readonly<Record<string, unknown>>): Result<NewVersion, DomainError> => {
  const label = labelOf(b.label)
  const sizeBytes = Number(b.size_bytes)
  if (!LABEL.test(label)) return err(invalidLabel())
  return Number.isInteger(sizeBytes) && sizeBytes > 0 ? ok({ label, notes: notesOf(b.notes), sizeBytes }) : err(sizeRequired())
}

export const MB = 1024 * 1024
export const withinLimit = (sizeBytes: number, maxMb: number): Result<number, DomainError> =>
  sizeBytes > maxMb * MB ? err(tooLarge('ZIP_TOO_LARGE', `El ZIP supera el máximo de ${maxMb} MB`)) : ok(sizeBytes)

export const originalKey = (id: string): string => `originals/${id}.zip`
export const publishedPrefix = (id: string): string => `builds/${id}/`

// ── Reglas de estado ──────────────────────────────────────────────────────────

const rule = (allowed: boolean, code: string, message: string): Result<null, DomainError> =>
  allowed ? ok(null) : err(conflict(code, message))

export const canReceiveZip = (v: Version) => rule(v.status === 'uploading', 'VERSION_NOT_UPLOADING', 'La versión ya no espera el ZIP')

// Se completa al subir y también para reintentar una publicación fallida
export const canComplete = (v: Version) =>
  rule(v.status === 'uploading' || v.status === 'failed', 'VERSION_BUSY', 'La versión ya se está publicando o está lista')

export const canActivate = (v: Version) => rule(v.status === 'ready', 'VERSION_NOT_READY', 'Solo se puede activar una versión lista')

export const canPreview = (v: Version) => rule(v.status === 'ready', 'VERSION_NOT_READY', 'La versión aún no está lista')

export const canRemove = (v: Version, activeId: string | null) => v.id === activeId
  ? rule(false, 'VERSION_ACTIVE', 'No se puede borrar la versión activa: activa otra primero')
  : rule(v.status !== 'processing', 'VERSION_PUBLISHING', 'Espera a que termine de publicarse')

export const zipMissing = (): DomainError => validation('ZIP_MISSING', 'El ZIP no llegó al almacenamiento. Vuelve a subirlo.')
export const stateChanged = (): DomainError => conflict('VERSION_STATE_CHANGED', 'La versión cambió de estado; recarga la lista')
export const presignedOnly = (): DomainError => validation('UPLOAD_PRESIGNED_ONLY', 'Con S3 el ZIP se sube a la URL prefirmada')

export const INTERRUPTED = 'La publicación se interrumpió porque la API se reinició. Reintenta.'

/** Lo que guarda la versión al quedar lista: el manifiesto del build más cuánto tardó en publicarse. */
export type Published = { readonly prefix: string; readonly manifest: Manifest; readonly publishMs: number; readonly at: Date }

// Puntero que lee el Worker para servir la versión activa
export const pointerFor = (v: Version, at: Date) =>
  JSON.stringify({ version_id: v.id, label: v.label, prefix: v.r2Prefix, activated_at: at })

export const PREVIEW_TTL_S = 2 * 3600
