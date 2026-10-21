import { z } from 'zod'
import { AUDIT_ACTIONS, type AuditRecord } from '@earthcation/model'
import { isoDates } from './camelize'

// Respuestas v1 del registro de auditoría. La IP nunca se guarda: solo su huella.

export const auditRecordDto = z.object({
  id: z.string(),
  occurredAt: z.iso.datetime(),
  actorId: z.string().nullable().describe('Quién lo hizo; vacío en acciones sin sesión (un inicio de sesión fallido)'),
  actorRole: z.string().nullable(),
  action: z.string().describe('Qué se hizo, p. ej. user.created, session.started, game_version.activated'),
  targetType: z.string().describe('Sobre qué tipo de recurso: user, organization, location, session, game_version, account'),
  targetId: z.string().nullable(),
  changes: z.record(z.string(), z.unknown()).describe('Qué cambió, sin datos sensibles: nombres de campos y valores no personales'),
  ipHash: z.string().nullable().describe('Huella (HMAC) de la IP de origen, nunca la IP'),
  userAgent: z.string().nullable(),
})

export const toAuditRecordDto = (r: AuditRecord): z.infer<typeof auditRecordDto> => isoDates({ ...r }) as z.infer<typeof auditRecordDto>

export const auditFilterQuery = z.object({
  actorId: z.uuid().optional().describe('Solo lo hecho por esta persona'),
  action: z.enum(AUDIT_ACTIONS).optional(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  from: z.coerce.date().optional().describe('Desde (ISO 8601, inclusive)'),
  to: z.coerce.date().optional().describe('Hasta (ISO 8601, inclusive)'),
})

const csvCell = (v: unknown): string => {
  const text = v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const COLUMNS = ['occurredAt', 'actorId', 'actorRole', 'action', 'targetType', 'targetId', 'changes', 'ipHash', 'userAgent'] as const

/** CSV con una fila por registro (la exportación para revisiones y auditorías externas). */
export const auditCsv = (records: readonly z.infer<typeof auditRecordDto>[]): string =>
  [COLUMNS.join(','), ...records.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n'
