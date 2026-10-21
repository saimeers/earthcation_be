import type { LearningReadModel, LearningRow } from '@earthcation/model'
import type { GetLevelProgressQuery } from './GetLevelProgressQuery'

/** Progreso del jugador en un nivel: completitud y último resultado por riesgo (`GET /api/progress/level/:levelId`). */
export class GetLevelProgressUseCase {
  constructor(private readonly reads: LearningReadModel) {}

  execute(query: GetLevelProgressQuery): Promise<LearningRow> {
    return this.reads.levelProgress(query.userId, query.levelId)
  }
}
