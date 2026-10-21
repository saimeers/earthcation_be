import type { LearningReadModel, LearningRow } from '@earthcation/model'
import type { GetTelemetryOverviewQuery } from './GetTelemetryOverviewQuery'

/** Vista global de telemetría para el panel: qué niveles cuestan más, de qué mueren, qué riesgo falla más. */
export class GetTelemetryOverviewUseCase {
  constructor(private readonly reads: LearningReadModel) {}

  execute(query: GetTelemetryOverviewQuery): Promise<LearningRow> {
    return this.reads.telemetryOverview({ sessionId: query.sessionId })
  }
}
