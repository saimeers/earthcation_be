import { z } from 'zod'
import type { ListAuditLogsUseCase } from '@earthcation/usecase'
import { listQuery } from '../http/pagination'
import { file, page } from '../http/reply'
import { route, type Route } from '../http/route'
import { auditCsv, auditFilterQuery, auditRecordDto, toAuditRecordDto } from '../dto/audit'

// El registro lo consultan admin y desarrollador (solo lectura): ven lo que hizo cada persona del personal
const AUDITORS = ['admin', 'developer'] as const

const MAX_EXPORT_ROWS = 10_000

const logQuery = listQuery.pick({ page: true, limit: true }).extend(auditFilterQuery.shape)
const exportQuery = auditFilterQuery

/** Rutas de v1 del registro de auditoría. */
export const auditRoutesV1 = (uc: ListAuditLogsUseCase): Route[] => [
  route({
    method: 'get', path: '/audit-logs', tag: 'Auditoría', summary: 'Consulta el registro de auditoría', roles: AUDITORS,
    query: logQuery,
    response: { status: 200, description: 'Una página de registros, los más recientes primero', schema: z.array(auditRecordDto), paginated: true },
    handler: async ({ query }) => {
      const { page: number, limit, ...filter } = query
      const { rows, total } = await uc.execute(filter, { offset: (number - 1) * limit, limit })
      return page(rows.map(toAuditRecordDto), { page: number, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) })
    },
  }),
  route({
    method: 'get', path: '/audit-logs/export', tag: 'Auditoría', summary: `Exporta el registro en CSV (hasta ${MAX_EXPORT_ROWS} filas)`, roles: AUDITORS,
    query: exportQuery,
    response: { status: 200, description: 'Archivo .csv con los registros que cumplen el filtro, los más recientes primero', contentType: 'text/csv' },
    handler: async ({ query }) => {
      const { rows } = await uc.execute(query, { offset: 0, limit: MAX_EXPORT_ROWS })
      return file('text/csv; charset=utf-8', `auditoria-${new Date().toISOString().slice(0, 10)}.csv`, Buffer.from(auditCsv(rows.map(toAuditRecordDto)), 'utf8'))
    },
  }),
]
