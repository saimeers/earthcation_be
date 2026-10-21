import { z } from 'zod'
import type { GameVersion } from '@earthcation/model'
import type { CreatedVersion, DeployStatus, ListedVersion, PreviewLink, UploadTarget } from '@earthcation/usecase'
import { isoDates } from './camelize'

// Respuestas v1 del despliegue del juego: camelCase y fechas ISO. No salen las claves internas del almacenamiento.

export const versionStatus = z.enum(['uploading', 'processing', 'ready', 'failed'])

export const versionDto = z.object({
  id: z.string(),
  label: z.string(),
  notes: z.string().nullable(),
  status: versionStatus,
  manifest: z.looseObject({
    root: z.string().nullable().optional(),
    compression: z.string().nullable().optional(),
    productVersion: z.string().nullable().optional(),
    totalBytes: z.number().optional(),
    publishMs: z.number().optional(),
  }).nullable(),
  sizeBytes: z.number().int().nullable(),
  error: z.string().nullable(),
  uploadedBy: z.string().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  activatedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const toVersionDto = (v: GameVersion): z.infer<typeof versionDto> => {
  const p = v.toProps()
  return isoDates({
    id: p.id, label: p.label, notes: p.notes, status: p.status, manifest: p.manifest, sizeBytes: p.sizeBytes, error: p.error,
    uploadedBy: p.uploadedBy, publishedAt: p.publishedAt, activatedAt: p.activatedAt, createdAt: p.createdAt, updatedAt: p.updatedAt,
  }) as z.infer<typeof versionDto>
}

export const listedVersionDto = versionDto.extend({
  uploader: z.object({ id: z.string(), firstName: z.string().nullable(), lastName: z.string().nullable() }).nullable(),
  isActive: z.boolean().describe('true si es la versión que sirve el Worker'),
})

export const toListedVersionDto = (l: ListedVersion): z.infer<typeof listedVersionDto> => ({
  ...toVersionDto(l.version),
  uploader: l.uploader && { id: l.uploader.id, firstName: l.uploader.firstName, lastName: l.uploader.lastName },
  isActive: l.isActive,
})

export const createVersionBody = z.object({
  label: z.string().min(1).describe('Nombre de la versión, p. ej. 2.1.3'),
  notes: z.string().max(2000).nullable().optional(),
  sizeBytes: z.number().int().positive().describe('Tamaño del ZIP en bytes'),
})

export const editVersionBody = z.object({
  notes: z.string().max(2000).nullable().describe("Nota de la versión; vacío o null la borra"),
})

export const uploadTargetDto = z.object({
  mode: z.string().describe('presigned: se sube a la URL de S3; local: se sube a la API (desarrollo)'),
  method: z.literal('PUT'),
  url: z.string(),
  headers: z.record(z.string(), z.string()),
})

const toUploadTarget = (u: UploadTarget, id: string): z.infer<typeof uploadTargetDto> => ({
  mode: u.mode, method: 'PUT', url: u.mode === 'presigned' ? u.url : `/api/v1/game-versions/${id}/upload`, headers: { 'Content-Type': 'application/zip' },
})

export const createdVersionDto = z.object({ version: versionDto, upload: uploadTargetDto })

export const toCreatedVersionDto = (c: CreatedVersion): z.infer<typeof createdVersionDto> =>
  ({ version: toVersionDto(c.version), upload: toUploadTarget(c.upload, c.version.id) })

export const deployStatusDto = z.object({
  playUrl: z.string(),
  storage: z.unknown().describe('Dónde se guardan los originales y los publicados'),
  maxMb: z.number(),
  active: z.object({ id: z.string(), label: z.string(), activatedAt: z.iso.datetime().nullable(), productVersion: z.string().nullable() }).nullable(),
})

export const toDeployStatusDto = (s: DeployStatus): unknown => isoDates({
  playUrl: s.playUrl,
  storage: s.storage,
  maxMb: s.maxMb,
  active: s.active && { id: s.active.id, label: s.active.label, activatedAt: s.active.activatedAt, productVersion: s.active.productVersion },
})

export const previewDto = z.object({ url: z.string(), expiresIn: z.number().describe('Segundos de vigencia del enlace') })

export const toPreviewDto = (p: PreviewLink): z.infer<typeof previewDto> => ({ url: p.url, expiresIn: p.expiresIn })
