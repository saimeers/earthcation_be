import type { SessionDetail, SessionRow } from '../detail'

/** Puerto de salida: dibuja el Excel de la sesión (`GET /api/sessions/:id/export.xlsx`) a partir de datos puros. */
export interface SessionReportWriter {
  write(detail: SessionDetail, attempts: readonly SessionRow[], now: Date): Promise<Buffer>
}
