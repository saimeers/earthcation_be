type Fields = Readonly<Record<string, unknown>>

/** Resultado creado o reemplazado (fila cruda: v1 la devuelve tal cual). */
export interface SaveRiskResultInput {
  readonly userId: string
  readonly riskId: unknown
  readonly sessionId: unknown
  readonly attemptId: unknown
  readonly isMitigated: unknown
  readonly mistakesCount: unknown
  readonly reactionTimeMs: unknown
  readonly detail: unknown
}

/** Intento creado (fila cruda: v1 la devuelve tal cual). */
export interface CreateAttemptInput {
  readonly userId: string
  readonly levelKey: string
  readonly levelId: unknown
  readonly sessionId: unknown
  readonly attemptNumber: number
  readonly varkStyle: unknown
  readonly gasBrand: unknown
  readonly gameVersion: string | null
}

/** Puerto de salida: escrituras del juego (resultados por riesgo, intentos de nivel, eventos de telemetría). */
export interface LearningRepository {
  riskExists(riskId: unknown): Promise<boolean>
  /** Sala del intento si es del jugador (null si no es suyo o no tiene). */
  attemptSession(attemptId: unknown, userId: string): Promise<unknown>
  saveResult(input: SaveRiskResultInput): Promise<Fields>
  abandonOpen(userId: string, levelKey: string, now: Date): Promise<void>
  countAttempts(userId: string, levelKey: string): Promise<number>
  levelIdForNumber(n: string): Promise<unknown>
  createAttempt(input: CreateAttemptInput): Promise<Fields>
  ownsAttempt(attemptId: unknown, userId: string): Promise<boolean>
  updateAttempt(attemptId: unknown, patch: Fields): Promise<Fields>
  saveEvents(rows: readonly Fields[]): Promise<void>
}
