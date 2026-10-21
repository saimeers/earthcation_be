import {
  levelNumber, NewAttemptInput, type Cache, type Clock, type FreePlaySessions, type LearningRepository,
} from '@earthcation/model'
import type { StartAttemptCommand } from './StartAttemptCommand'

export interface StartAttemptDeps {
  readonly repo: LearningRepository
  readonly freePlaySessions: FreePlaySessions
  readonly cache: Cache
  readonly clock: Clock
}

const HOUR = 3600

/** Abre un intento de nivel; uno anterior que quedó abierto se marca abandonado (`POST /api/telemetry/attempts`). */
export class StartAttemptUseCase {
  constructor(private readonly deps: StartAttemptDeps) {}

  async execute(cmd: StartAttemptCommand): Promise<Readonly<Record<string, unknown>>> {
    const input = NewAttemptInput.from(cmd.body)
    const [previous, levelId, sessionId] = await this.open(cmd.userId, input)
    return this.deps.repo.createAttempt({
      userId: cmd.userId, levelKey: input.levelKey, levelId, sessionId, attemptNumber: previous + 1, ...input.values,
    })
  }

  // Las 4 consultas son independientes: en paralelo (en fila era lo más lento con 50 jugadores entrando a la vez)
  private async open(userId: string, input: NewAttemptInput): Promise<readonly [number, unknown, unknown]> {
    const [, previous, levelId, sessionId] = await Promise.all([
      this.deps.repo.abandonOpen(userId, input.levelKey, this.deps.clock.now()),
      this.deps.repo.countAttempts(userId, input.levelKey),
      this.levelId(input.levelKey),
      this.deps.freePlaySessions.resolve(userId, input.sessionId),
    ])
    return [previous, levelId, sessionId]
  }

  // Los niveles casi no cambian: el id por número se cachea 1 h
  private levelId(levelKey: string): Promise<unknown> {
    const n = levelNumber(levelKey)
    return n === null ? Promise.resolve(null)
      : this.deps.cache.remember({ namespace: 'levels', key: `by-number:${n}`, ttlSeconds: HOUR }, () => this.deps.repo.levelIdForNumber(n))
  }
}
