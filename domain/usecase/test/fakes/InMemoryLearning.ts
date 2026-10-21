import type {
  CreateAttemptInput, FreePlaySessions, LearningRepository, LearningRow, SaveRiskResultInput,
} from '@earthcation/model'

type Fields = Readonly<Record<string, unknown>>

/** Repositorio de aprendizaje en memoria, para probar los casos de uso sin base de datos. */
export class InMemoryLearningRepository implements LearningRepository {
  readonly results: Fields[] = []
  readonly attempts = new Map<string, Fields>()
  /** `attemptId -> sessionId` de los intentos del jugador, para resolver `attemptSession`. */
  readonly attemptSessions = new Map<string, unknown>()
  /** Riesgos válidos (por defecto solo 'CR-01'). */
  readonly risks = new Set(['CR-01'])
  readonly events: Fields[] = []
  private nextId = 0

  riskExists(riskId: unknown) { return Promise.resolve(this.risks.has(String(riskId))) }

  attemptSession(attemptId: unknown) { return Promise.resolve(this.attemptSessions.get(String(attemptId)) ?? null) }

  saveResult(input: SaveRiskResultInput): Promise<Fields> {
    const row = { user_id: input.userId, risk_id: input.riskId, session_id: input.sessionId, attempt_id: input.attemptId, is_mitigated: input.isMitigated }
    this.results.push(row)
    return Promise.resolve(row)
  }

  abandonOpen() { return Promise.resolve() }

  countAttempts() { return Promise.resolve(this.attempts.size) }

  levelIdForNumber(n: string) { return Promise.resolve(Number(n)) }

  createAttempt(input: CreateAttemptInput): Promise<Fields> {
    this.nextId += 1
    const id = `intento-${this.nextId}`
    const row = { id, user_id: input.userId, level_key: input.levelKey, level_id: input.levelId, session_id: input.sessionId, attempt_number: input.attemptNumber }
    this.attempts.set(id, row)
    return Promise.resolve(row)
  }

  ownsAttempt(attemptId: unknown, userId: string) {
    const row = this.attempts.get(String(attemptId))
    return Promise.resolve(row !== undefined && row.user_id === userId)
  }

  updateAttempt(attemptId: unknown, patch: Fields): Promise<Fields> {
    const updated = { ...this.attempts.get(String(attemptId)), ...patch }
    this.attempts.set(String(attemptId), updated)
    return Promise.resolve(updated)
  }

  saveEvents(rows: readonly Fields[]) {
    this.events.push(...rows)
    return Promise.resolve()
  }
}

/** Sin sala del juego, resuelve a "juego-libre"; con sala, la deja igual. */
export class InMemoryFreePlaySessions implements FreePlaySessions {
  resolve(_userId: string, sessionId: unknown) { return Promise.resolve(sessionId ?? 'juego-libre') }
}

/** Modelo de lectura en memoria (solo lo que ejercitan las pruebas de casos de uso). */
export class InMemoryLearningReadModel {
  levelProgressResult: LearningRow = {}

  levels() { return Promise.resolve([]) }
  level() { return Promise.resolve(null) }
  progress() { return Promise.resolve([]) }
  levelProgress() { return Promise.resolve(this.levelProgressResult) }
  attempts() { return Promise.resolve([]) }
  attemptDetail() { return Promise.resolve(null) }
  userSummary() { return Promise.resolve({}) }
  telemetryOverview() { return Promise.resolve({}) }
}
