import type { GameVersion, VersionManifest } from '@earthcation/model'
import type { CreatedVersion, DeployStatus, ListedVersion, PreviewLink, UploadTarget } from '@earthcation/usecase'

// Respuestas legacy del despliegue: las columnas snake_case de game_versions, como las lee el panel

const manifestLegacy = (m: VersionManifest) => ({
  root: m.root, compression: m.compression, product_version: m.productVersion, total_bytes: m.totalBytes,
  files: m.files, warnings: m.warnings, publish_ms: m.publishMs,
})

export const versionLegacy = (v: GameVersion) => {
  const p = v.toProps()
  return {
    id: p.id, label: p.label, notes: p.notes, status: p.status, s3_key: p.originalKey, r2_prefix: p.publishedPrefix,
    manifest: p.manifest && manifestLegacy(p.manifest),
    // BIGINT: legacy siempre lo entregó como texto
    size_bytes: p.sizeBytes === null ? null : String(p.sizeBytes),
    error: p.error, uploaded_by: p.uploadedBy, published_at: p.publishedAt, activated_at: p.activatedAt,
    created_at: p.createdAt, updated_at: p.updatedAt,
  }
}

export const listedVersionLegacy = (l: ListedVersion) => ({
  ...versionLegacy(l.version),
  uploader: l.uploader && { id: l.uploader.id, first_name: l.uploader.firstName, last_name: l.uploader.lastName },
  is_active: l.isActive,
})

const ZIP_HEADERS = { 'Content-Type': 'application/zip' }

const uploadLegacy = (u: UploadTarget, id: string) => ({
  mode: u.mode, method: 'PUT',
  url: u.mode === 'presigned' ? u.url : `/api/deploy/versions/${id}/upload`,
  headers: ZIP_HEADERS,
})

export const createdVersionLegacy = (c: CreatedVersion) => ({ version: versionLegacy(c.version), upload: uploadLegacy(c.upload, c.version.id) })

export const deployStatusLegacy = (s: DeployStatus) => ({
  play_url: s.playUrl, storage: s.storage, max_mb: s.maxMb,
  active: s.active && {
    id: s.active.id, label: s.active.label, activated_at: s.active.activatedAt, product_version: s.active.productVersion,
  },
})

export const previewLegacy = (p: PreviewLink) => ({ url: p.url, expires_in: p.expiresIn })
