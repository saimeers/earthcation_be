import type { AuditFilter, AuditLog, AuditPage, AuditWindow } from '@earthcation/model'

/** Registros de auditoría, los más recientes primero, filtrados por actor, acción, objetivo y fechas. */
export class ListAuditLogsUseCase {
  constructor(private readonly audit: AuditLog) {}

  execute(filter: AuditFilter, window: AuditWindow): Promise<AuditPage> {
    return this.audit.list(filter, window)
  }
}
