import { AttemptNotFoundError, type LearningReadModel, type LearningRow } from '@earthcation/model'

/** Un intento con sus resultados por riesgo y eventos de telemetría (`GET /api/telemetry/attempts/:id`). */
export class GetAttemptDetailUseCase {
  constructor(private readonly reads: LearningReadModel) {}

  async execute(id: string): Promise<LearningRow> {
    const detail = await this.reads.attemptDetail(id)
    if (detail === null) throw new AttemptNotFoundError()
    return detail
  }
}
