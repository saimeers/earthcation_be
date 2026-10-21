import type { LearningReadModel, LearningRow } from '@earthcation/model'
import type { ListProgressQuery } from './ListProgressQuery'

/** Progreso por riesgo de un jugador (propio o, para el panel, el de otro), con su sala si se filtra. */
export class ListProgressUseCase {
  constructor(private readonly reads: LearningReadModel) {}

  execute(query: ListProgressQuery): Promise<readonly LearningRow[]> {
    return this.reads.progress(query.userId, { sessionId: query.sessionId })
  }
}
