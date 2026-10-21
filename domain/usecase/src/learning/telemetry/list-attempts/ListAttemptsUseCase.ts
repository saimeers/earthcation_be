import type { LearningReadModel, LearningRow } from '@earthcation/model'
import type { ListAttemptsQuery } from './ListAttemptsQuery'

/** Intentos de nivel de un jugador, propios o de otro para el panel (`GET /api/telemetry/*\/attempts`). */
export class ListAttemptsUseCase {
  constructor(private readonly reads: LearningReadModel) {}

  execute(query: ListAttemptsQuery): Promise<readonly LearningRow[]> {
    return this.reads.attempts(query.userId, { sessionId: query.sessionId, levelKey: query.levelKey })
  }
}
