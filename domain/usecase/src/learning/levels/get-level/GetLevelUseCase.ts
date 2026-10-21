import { LevelNotFoundError, type LearningReadModel, type LearningRow } from '@earthcation/model'

/** Un nivel con sus riesgos (`GET /api/levels/:id`). */
export class GetLevelUseCase {
  constructor(private readonly reads: LearningReadModel) {}

  async execute(id: string): Promise<LearningRow> {
    const level = await this.reads.level(id)
    if (level === null) throw new LevelNotFoundError()
    return level
  }
}
