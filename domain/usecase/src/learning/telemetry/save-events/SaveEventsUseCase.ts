import { AttemptNotFoundError, EventBatch, type LearningRepository } from '@earthcation/model'
import type { SaveEventsCommand } from './SaveEventsCommand'

/** Guarda el lote de eventos de telemetría de un intento propio (`POST /api/telemetry/events`). */
export class SaveEventsUseCase {
  constructor(private readonly repo: LearningRepository) {}

  async execute(cmd: SaveEventsCommand): Promise<number> {
    const batch = EventBatch.from(cmd.body)
    if (!(await this.repo.ownsAttempt(batch.attemptId, cmd.userId))) throw new AttemptNotFoundError()
    await this.repo.saveEvents(batch.rows(cmd.userId))
    return batch.events.length
  }
}
