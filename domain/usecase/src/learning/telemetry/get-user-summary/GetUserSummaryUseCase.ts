import type { LearningReadModel, LearningRow } from '@earthcation/model'
import type { GetUserSummaryQuery } from './GetUserSummaryQuery'

/** Trazabilidad de un jugador: por nivel, por riesgo y dónde se equivoca (`GET /api/telemetry/users/:userId/summary`). */
export class GetUserSummaryUseCase {
  constructor(private readonly reads: LearningReadModel) {}

  execute(query: GetUserSummaryQuery): Promise<LearningRow> {
    return this.reads.userSummary(query.userId, { sessionId: query.sessionId })
  }
}
