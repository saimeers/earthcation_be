import type { GameVersion, VersionManifest } from '@earthcation/model'
import type { CreatedVersion, DeployStatus, ListedVersion, PreviewLink, UploadTarget } from '@earthcation/usecase'

// Respuestas v1 del despliegue: las columnas snake_case de game_versions, como las lee el panel

const manifestV1 = (m: VersionManifest) => ({
  root: m.root, compression: m.compression, product_version: m.productVersion, total_bytes: m.totalBytes,
  files: m.files, warnings: m.warnings, publish_ms: m.publishMs,
})

export const versionV1 = (v: GameVersion) => {
  const p = v.toProps()
  return {
    id: p.id, label: p.label, notes: p.notes, status: p.status, s3_key: p.originalKey, r2_prefix: p.publishedPrefix,
    manifest: p.manifest && manifestV1(p.manifest),
    // BIGINT: v1 siempre lo entregó como texto
    size_bytes: p.sizeBytes === null ? null : String(p.sizeBytes),
    error: p.error, uploaded_by: p.uploadedBy, published_at: p.publishedAt, activated_at: p.activatedAt,
    created_at: p.createdAt, updated_at: p.updatedAt,
  }
}

export const listedVersionV1 = (l: ListedVersion) => ({
  ...versionV1(l.version),
  uploader: l.uploader && { id: l.uploader.id, first_name: l.uploader.firstName, last_name: l.uploader.lastName },
  is_active: l.isActive,
})

const ZIP_HEADERS = { 'Content-Type': 'application/zip' }

const uploadV1 = (u: UploadTarget, id: string) => ({
  mode: u.mode, method: 'PUT',
  url: u.mode === 'presigned' ? u.url : `/api/deploy/versions/${id}/upload`,
  headers: ZIP_HEADERS,
})

export const createdVersionV1 = (c: CreatedVersion) => ({ version: versionV1(c.version), upload: uploadV1(c.upload, c.version.id) })

export const deployStatusV1 = (s: DeployStatus) => ({
  play_url: s.playUrl, storage: s.storage, max_mb: s.maxMb,
  active: s.active && {
    id: s.active.id, label: s.active.label, activated_at: s.active.activatedAt, product_version: s.active.productVersion,
  },
})

export const previewV1 = (p: PreviewLink) => ({ url: p.url, expires_in: p.expiresIn })
