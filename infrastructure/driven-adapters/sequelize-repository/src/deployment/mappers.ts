import {
  GameVersion, type Compression, type GameVersionListing, type VersionManifest, type VersionStatus,
} from '@earthcation/model'

// Filas de game_versions (snake_case) ↔ entidad. El manifiesto se guarda en snake_case, como lo lee el panel por v1.

export interface ManifestRow {
  root?: unknown
  compression?: unknown
  product_version?: unknown
  total_bytes?: unknown
  files?: unknown
  warnings?: unknown
  publish_ms?: unknown
}

export interface GameVersionRow {
  id: string
  label: string
  notes: string | null
  status: VersionStatus
  s3_key: string | null
  r2_prefix: string | null
  manifest: ManifestRow | null
  /** BIGINT: pg lo entrega como texto. */
  size_bytes: string | number | null
  error: string | null
  uploaded_by: string | null
  published_at: Date | null
  activated_at: Date | null
  created_at: Date
  updated_at: Date
}

export interface UploaderRow { id: string; first_name: string | null; last_name: string | null }

const text = (v: unknown): string => (typeof v === 'string' ? v : '')
const count = (v: unknown): number => (typeof v === 'number' ? v : 0)
const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

const toManifest = (m: ManifestRow): VersionManifest => ({
  root: text(m.root), compression: text(m.compression) as Compression,
  productVersion: typeof m.product_version === 'string' ? m.product_version : null,
  totalBytes: count(m.total_bytes), files: list(m.files), warnings: list(m.warnings), publishMs: count(m.publish_ms),
})

export const manifestRow = (m: VersionManifest): ManifestRow => ({
  root: m.root, compression: m.compression, product_version: m.productVersion, total_bytes: m.totalBytes,
  files: m.files, warnings: m.warnings, publish_ms: m.publishMs,
})

export const toGameVersion = (r: GameVersionRow): GameVersion => GameVersion.restore({
  id: r.id, label: r.label, notes: r.notes, status: r.status, originalKey: r.s3_key, publishedPrefix: r.r2_prefix,
  manifest: r.manifest === null ? null : toManifest(r.manifest), sizeBytes: r.size_bytes === null ? null : Number(r.size_bytes),
  error: r.error, uploadedBy: r.uploaded_by, publishedAt: r.published_at, activatedAt: r.activated_at,
  createdAt: r.created_at, updatedAt: r.updated_at,
})

export const toListing = (r: GameVersionRow & { uploader: UploaderRow | null }): GameVersionListing => ({
  version: toGameVersion(r),
  uploader: r.uploader && { id: r.uploader.id, firstName: r.uploader.first_name, lastName: r.uploader.last_name },
})

/** Columnas que cambian con el ciclo de vida (el resto se fija al crear). */
export const lifecycleColumns = (v: GameVersion) => {
  const p = v.toProps()
  return {
    status: p.status, error: p.error, size_bytes: p.sizeBytes, r2_prefix: p.publishedPrefix,
    manifest: p.manifest && manifestRow(p.manifest), published_at: p.publishedAt, activated_at: p.activatedAt,
  }
}
