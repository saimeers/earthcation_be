import { AttemptNotFoundError, toAttemptPatch, type Clock, type LearningRepository } from '@earthcation/model'
import type { EndAttemptCommand } from './EndAttemptCommand'

export interface EndAttemptDeps {
  readonly repo: LearningRepository
  readonly clock: Clock
}

/** Cierra un intento del propio jugador (completado, fallido o abandonado) (`PATCH /api/telemetry/attempts/:id`). */
export class EndAttemptUseCase {
  constructor(private readonly deps: EndAttemptDeps) {}

  async execute(cmd: EndAttemptCommand): Promise<Readonly<Record<string, unknown>>> {
    if (!(await this.deps.repo.ownsAttempt(cmd.attemptId, cmd.userId))) throw new AttemptNotFoundError()
    return this.deps.repo.updateAttempt(cmd.attemptId, toAttemptPatch(cmd.body, this.deps.clock.now()))
  }
}
