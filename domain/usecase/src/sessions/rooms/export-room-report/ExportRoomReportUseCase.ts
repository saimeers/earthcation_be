import {
  SessionNotFoundError, type Clock, type SessionDetailReader, type SessionReportWriter, type SessionRepository,
} from '@earthcation/model'
import { assertCanView } from '../assertCanView'
import type { ExportRoomReportQuery } from './ExportRoomReportQuery'
import type { RoomReport } from './RoomReport'

export interface ExportRoomReportDeps {
  readonly repo: SessionRepository
  readonly detailReader: SessionDetailReader
  readonly reportWriter: SessionReportWriter
  readonly clock: Clock
}

/** Excel de la sesión: Resumen, Participantes, Riesgos, Resultados por riesgo, Intentos (`GET /:id/export.xlsx`). */
export class ExportRoomReportUseCase {
  constructor(private readonly deps: ExportRoomReportDeps) {}

  async execute(query: ExportRoomReportQuery): Promise<RoomReport> {
    await assertCanView(this.deps.repo, query.id, query.requester)
    const detail = await this.deps.detailReader.read(query.id)
    if (detail === null) throw new SessionNotFoundError()
    const attempts = await this.deps.repo.exportAttempts(query.id)
    const buffer = await this.deps.reportWriter.write(detail, attempts, this.deps.clock.now())
    return { buffer, code: detail.session.code }
  }
}
