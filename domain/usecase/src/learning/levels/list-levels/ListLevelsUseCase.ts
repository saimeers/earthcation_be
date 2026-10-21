import type { LearningReadModel, LearningRow } from '@earthcation/model'

/** Niveles del juego con sus riesgos (`GET /api/levels`). */
export class ListLevelsUseCase {
  constructor(private readonly reads: LearningReadModel) {}

  execute(): Promise<readonly LearningRow[]> {
    return this.reads.levels()
  }
}
