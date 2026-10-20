import type { DomainError } from '../../shared/errors'
import { andThen, err, fromNullable, ok, type Result } from '../../shared/result'
import {
  attemptNotFound, eventRow, levelNotFound, levelNumber, riskNotFound, toAttemptPatch, toEventBatch, toNewAttempt, toRiskResult,
  type EventBatch, type NewAttempt, type RiskResult,
} from './domain'
import type { AttemptFilter, LearningDeps, PlaceFilter, SessionFilter } from './ports'

type Fields = Readonly<Record<string, unknown>>
type Outcome<T> = Promise<Result<T, DomainError>>

const HOUR = 3600
const MINUTE = 60

// ── Resultado por riesgo ──────────────────────────────────────────────────────

// Sin sala: la del intento (si se envió y es del jugador) o la sesión "Juego libre" del jugador
const sessionFor = async (d: LearningDeps, userId: string, r: RiskResult): Promise<unknown> => {
  const fromAttempt = r.sessionId ?? (r.attemptId === null ? null : await d.repo.attemptSession(r.attemptId, userId))
  return d.freeSessions.resolve(userId, fromAttempt ?? null)
}

const storeResult = (d: LearningDeps, userId: string) => async (r: RiskResult): Outcome<Fields> => {
  if (!(await d.repo.riskExists(r.riskId))) return err(riskNotFound())
  const sessionId = await sessionFor(d, userId, r)
  return ok(await d.repo.saveResult({ user_id: userId, risk_id: r.riskId, session_id: sessionId, attempt_id: r.attemptId, ...r.values }))
}

const saveProgress = (d: LearningDeps) => (userId: string, body: Fields): Outcome<Fields> =>
  andThen(toRiskResult(body), storeResult(d, userId))

// ── Intentos y eventos ────────────────────────────────────────────────────────

// Los niveles casi no cambian: el id por número se cachea 1 h
const levelId = (d: LearningDeps, levelKey: string): Promise<unknown> => {
  const n = levelNumber(levelKey)
  return n === null ? Promise.resolve(null)
    : d.cache.remember({ namespace: 'levels', key: `by-number:${n}`, ttlSeconds: HOUR }, () => d.repo.levelIdForNumber(n))
}

// Un intento anterior que quedó abierto (cerró el juego, recargó) se marca abandonado. Las 4 consultas son
// independientes: en paralelo (en fila era lo más lento con 50 jugadores entrando a la vez)
const openAttempt = (d: LearningDeps, userId: string) => async (a: NewAttempt): Outcome<Fields> => {
  const [, previous, level, sessionId] = await Promise.all([
    d.repo.abandonOpen(userId, a.levelKey, d.now()), d.repo.countAttempts(userId, a.levelKey),
    levelId(d, a.levelKey), d.freeSessions.resolve(userId, a.sessionId),
  ])
  return ok(await d.repo.createAttempt({
    user_id: userId, level_key: a.levelKey, level_id: level, session_id: sessionId, attempt_number: previous + 1, ...a.values,
  }))
}

const startAttempt = (d: LearningDeps) => (userId: string, body: Fields): Outcome<Fields> =>
  andThen(toNewAttempt(body), openAttempt(d, userId))

const owned = async (d: LearningDeps, attemptId: unknown, userId: string): Outcome<null> =>
  (await d.repo.ownsAttempt(attemptId, userId)) ? ok(null) : err(attemptNotFound())

const endAttempt = (d: LearningDeps) => (userId: string, attemptId: string, body: Fields): Outcome<Fields> =>
  andThen(owned(d, attemptId, userId), async () => ok(await d.repo.updateAttempt(attemptId, toAttemptPatch(body, d.now()))))

const storeEvents = (d: LearningDeps, userId: string) => (b: EventBatch): Outcome<number> =>
  andThen(owned(d, b.attemptId, userId), async () => {
    await d.repo.saveEvents(b.events.map(eventRow(b.attemptId, userId)))
    return ok(b.events.length)
  })

const saveEvents = (d: LearningDeps) => (userId: string, body: Fields): Outcome<number> =>
  andThen(toEventBatch(body), storeEvents(d, userId))

// ── Lecturas ──────────────────────────────────────────────────────────────────

const writes = (d: LearningDeps) => ({
  saveProgress: saveProgress(d), startAttempt: startAttempt(d), endAttempt: endAttempt(d), saveEvents: saveEvents(d),
})

const reads = (d: LearningDeps) => ({
  levels: () => d.reads.levels(),
  level: async (id: string): Outcome<Fields> => fromNullable(await d.reads.level(id), levelNotFound),
  progress: (userId: string, filter: SessionFilter) => d.reads.progress(userId, filter),
  levelProgress: (userId: string, id: string) => d.reads.levelProgress(userId, id),
  attempts: (userId: string, filter: AttemptFilter) => d.reads.attempts(userId, filter),
  attemptDetail: async (id: string): Outcome<Fields> => fromNullable(await d.reads.attemptDetail(id), attemptNotFound),
  userSummary: (userId: string, filter: SessionFilter) => d.reads.userSummary(userId, filter),
  telemetryOverview: (filter: SessionFilter) => d.reads.telemetryOverview(filter),
})

// Recorren todo el historial: se cachean 60 s (los consultan el panel y sus refrescos)
const analytics = (d: LearningDeps) => ({
  overview: () => d.cache.remember({ namespace: 'analytics', key: 'overview', ttlSeconds: MINUTE }, () => d.analytics.overview()),
  byOrganization: (id: string) => d.analytics.byOrganization(id),
  byLocation: (filter: PlaceFilter) => d.analytics.byLocation(filter),
  minesMap: () => d.cache.remember({ namespace: 'analytics', key: 'mines-map', ttlSeconds: MINUTE }, () => d.analytics.minesMap()),
})

export const makeLearning = (d: LearningDeps) => ({ ...writes(d), ...reads(d), analytics: analytics(d) })

export type Learning = ReturnType<typeof makeLearning>
