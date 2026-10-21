import { RiskNotFoundError, RiskResultInput, type FreePlaySessions, type LearningRepository } from '@earthcation/model'
import type { SaveProgressCommand } from './SaveProgressCommand'

export interface SaveProgressDeps {
  readonly repo: LearningRepository
  readonly freePlaySessions: FreePlaySessions
}

/** Guarda el resultado del jugador frente a un riesgo; sin sala, cae en su "Juego libre" (`POST /api/progress/save`). */
export class SaveProgressUseCase {
  constructor(private readonly deps: SaveProgressDeps) {}

  async execute(cmd: SaveProgressCommand): Promise<Readonly<Record<string, unknown>>> {
    const input = RiskResultInput.from(cmd.body)
    if (!(await this.deps.repo.riskExists(input.riskId))) throw new RiskNotFoundError()
    const sessionId = await this.sessionFor(cmd.userId, input)
    return this.deps.repo.saveResult({
      userId: cmd.userId, riskId: input.riskId, sessionId, attemptId: input.attemptId, ...input.values,
    })
  }

  // Sin sala: la del intento (si se envió y es del jugador) o la sesión "Juego libre" del jugador
  private async sessionFor(userId: string, input: RiskResultInput): Promise<unknown> {
    const fromAttempt = input.sessionId ?? (input.attemptId === null ? null : await this.deps.repo.attemptSession(input.attemptId, userId))
    return this.deps.freePlaySessions.resolve(userId, fromAttempt ?? null)
  }
}
