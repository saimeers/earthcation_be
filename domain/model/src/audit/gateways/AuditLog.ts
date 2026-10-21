import type { AuditEntry, AuditRecord } from '../AuditEntry'

export interface AuditFilter {
  readonly actorId?: string
  readonly action?: string
  readonly targetType?: string
  readonly targetId?: string
  readonly from?: Date
  readonly to?: Date
}

/** Qué parte del resultado se pide (el registro crece sin tope: siempre se consulta por páginas). */
export interface AuditWindow {
  readonly offset: number
  readonly limit: number
}

export interface AuditPage {
  readonly rows: readonly AuditRecord[]
  /** Cuántos registros cumplen el filtro en total. */
  readonly total: number
}

/** Puerto de salida: el registro de auditoría (solo insertar y consultar). */
export interface AuditLog {
  record(entry: AuditEntry): Promise<void>
  /** Los más recientes primero. */
  list(filter: AuditFilter, window: AuditWindow): Promise<AuditPage>
}
