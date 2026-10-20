import type { Cache } from '../../ports/cache'

type Fields = Readonly<Record<string, unknown>>
type Rows = Promise<readonly Fields[]>

// Escrituras del juego
export type LearningRepository = {
  readonly riskExists: (riskId: unknown) => Promise<boolean>
  // Sala del intento si es del jugador (null si no es suyo o no tiene)
  readonly attemptSession: (attemptId: unknown, userId: string) => Promise<unknown>
  readonly saveResult: (row: Fields) => Promise<Fields>
  readonly abandonOpen: (userId: string, levelKey: string, now: Date) => Promise<void>
  readonly countAttempts: (userId: string, levelKey: string) => Promise<number>
  readonly levelIdForNumber: (n: string) => Promise<unknown>
  readonly createAttempt: (row: Fields) => Promise<Fields>
  readonly ownsAttempt: (attemptId: unknown, userId: string) => Promise<boolean>
  readonly updateAttempt: (attemptId: unknown, patch: Fields) => Promise<Fields>
  readonly saveEvents: (rows: readonly Fields[]) => Promise<void>
}

// La sala "Juego libre" del jugador cuando el juego no manda sala (contexto de sesiones)
export type FreeSessions = { readonly resolve: (userId: string, sessionId: unknown) => Promise<unknown> }

export type SessionFilter = { readonly sessionId?: string }
export type AttemptFilter = SessionFilter & { readonly levelKey?: string }

// Lecturas: filas tal como las consume el panel/juego por v1. Las agregaciones usan las funciones puras de
// attempts.ts y summaries.ts sobre lo que devuelve Postgres.
export type LearningReadModel = {
  readonly levels: () => Rows
  readonly level: (id: string) => Promise<Fields | null>
  readonly progress: (userId: string, filter: SessionFilter) => Rows
  readonly levelProgress: (userId: string, levelId: string) => Promise<Fields>
  readonly attempts: (userId: string, filter: AttemptFilter) => Rows
  readonly attemptDetail: (id: string) => Promise<Fields | null>
  readonly userSummary: (userId: string, filter: SessionFilter) => Promise<Fields>
  readonly telemetryOverview: (filter: SessionFilter) => Promise<Fields>
}

export type PlaceFilter = { readonly department?: string; readonly municipality?: string }

export type AnalyticsReadModel = {
  readonly overview: () => Promise<Fields>
  readonly byOrganization: (organizationId: string) => Rows
  readonly byLocation: (filter: PlaceFilter) => Rows
  readonly minesMap: () => Rows
}

export type LearningDeps = {
  readonly repo: LearningRepository
  readonly reads: LearningReadModel
  readonly analytics: AnalyticsReadModel
  readonly freeSessions: FreeSessions
  readonly cache: Cache
  readonly now: () => Date
}
