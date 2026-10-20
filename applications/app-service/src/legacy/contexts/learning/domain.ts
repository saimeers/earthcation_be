import { notFound, validation, type DomainError } from '../../shared/errors'
import { err, ok, type Result } from '../../shared/result'
import { latestAttemptByLevel, plainOf, type Plain } from './attempts'

// Aprendizaje: lo que el juego registra (intentos de nivel, eventos, resultado por riesgo) y cómo se lee.

type Fields = Readonly<Record<string, unknown>>

export const attemptNotFound = (): DomainError => notFound('ATTEMPT_NOT_FOUND', 'Intento no encontrado')
export const levelNotFound = (): DomainError => notFound('LEVEL_NOT_FOUND', 'Nivel no encontrado')
export const riskNotFound = (): DomainError => notFound('RISK_NOT_FOUND', 'Riesgo no encontrado')

const required = (code: string, message: string) => (): DomainError => validation(code, message)
const riskRequired = required('RISK_REQUIRED', 'risk_id es requerido')
const levelKeyRequired = required('LEVEL_KEY_REQUIRED', 'level_key es requerido')
const attemptRequired = required('ATTEMPT_REQUIRED', 'attempt_id es requerido')
const eventsRequired = required('EVENTS_REQUIRED', 'events debe ser un arreglo no vacío')
const eventTypeRequired = required('EVENT_TYPE_REQUIRED', 'cada evento requiere event_type')

// Falso como en JS (lo que v1 trataba con `!valor` o `valor || null`)
const present = (v: unknown): boolean => Boolean(v)
const orNull = (v: unknown): unknown => (present(v) ? v : null)
// Las claves pueden llegar como número desde el juego
const asKey = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v))
// Campos opcionales que v1 guardaba con `valor ?? null`
const nullable = (o: Fields, keys: readonly string[]): Fields => Object.fromEntries(keys.map((k) => [k, o[k] ?? null]))

// ── Resultado por riesgo ──────────────────────────────────────────────────────

export type RiskResult = {
  readonly riskId: unknown
  readonly sessionId: unknown
  readonly attemptId: unknown
  readonly values: Fields // is_mitigated, mistakes_count, reaction_time_ms, detail: tal cual al modelo
}

export const toRiskResult = (b: Fields): Result<RiskResult, DomainError> => present(b.risk_id)
  ? ok({
    riskId: b.risk_id, sessionId: orNull(b.session_id), attemptId: orNull(b.attempt_id),
    values: { detail: orNull(b.detail), is_mitigated: b.is_mitigated ?? false, mistakes_count: b.mistakes_count ?? 0, reaction_time_ms: b.reaction_time_ms ?? null },
  })
  : err(riskRequired())

// ── Intentos y eventos ────────────────────────────────────────────────────────

export type NewAttempt = { readonly levelKey: string; readonly sessionId: unknown; readonly values: Fields }

export const toNewAttempt = (b: Fields): Result<NewAttempt, DomainError> => present(b.level_key)
  ? ok({
    levelKey: asKey(b.level_key), sessionId: orNull(b.session_id),
    values: { vark_style: orNull(b.vark_style), gas_brand: orNull(b.gas_brand), game_version: typeof b.game_version === 'string' ? b.game_version.slice(0, 20) : null },
  })
  : err(levelKeyRequired())

// 'level2' → número 2 (el nivel se busca por nombre "Nivel 2…": el id interno puede no coincidir)
export const levelNumber = (levelKey: string): string | null => levelKey.replace(/\D/g, '') || null

const ATTEMPT_FIELDS = ['outcome', 'fail_reason', 'fail_risk_id', 'fail_stage', 'duration_ms', 'final_health', 'device_calibrated', 'gas_brand', 'summary']

/** Lo que el juego puede cambiar al cerrar un intento; un resultado final pone la hora de cierre. */
export const toAttemptPatch = (b: Fields, now: Date): Fields => {
  const patch = Object.fromEntries(ATTEMPT_FIELDS.filter((k) => b[k] !== undefined).map((k) => [k, b[k]]))
  return present(patch.outcome) && patch.outcome !== 'in_progress' ? { ...patch, ended_at: now } : patch
}

const isEvent = (e: unknown): e is Fields => e !== null && typeof e === 'object' && present((e as Fields).event_type)

export type EventBatch = { readonly attemptId: string; readonly events: readonly Fields[] }

export const toEventBatch = (b: Fields): Result<EventBatch, DomainError> => {
  if (!present(b.attempt_id)) return err(attemptRequired())
  if (!Array.isArray(b.events) || b.events.length === 0) return err(eventsRequired())
  const events: readonly unknown[] = b.events
  return events.every(isEvent) ? ok({ attemptId: asKey(b.attempt_id), events }) : err(eventTypeRequired())
}

export const eventRow = (attemptId: string, userId: string) => (e: Fields): Fields => ({
  attempt_id: attemptId, user_id: userId, event_type: e.event_type, risk_id: orNull(e.risk_id), stage: orNull(e.stage),
  ...nullable(e, ['t_ms', 'pos_x', 'health', 'fatigue', 'payload']),
})

// ── Progreso de un nivel para el jugador ──────────────────────────────────────

const recordedAt = (p: Plain): number => new Date(p.recorded_at as string).getTime()

const riskProgress = (results: readonly Plain[]) => (r: Plain) => {
  const mine = results.filter((p) => p.risk_id === r.id)
  const last = nullable(mine.toSorted((a, b) => recordedAt(b) - recordedAt(a))[0] ?? {}, ['mistakes_count', 'reaction_time_ms'])
  return {
    risk_id: r.id, risk_name: r.name, category: r.category, mitigated: mine.length > 0 && mine.every((p) => p.is_mitigated === true),
    last_mistakes: last.mistakes_count, last_reaction_ms: last.reaction_time_ms,
  }
}

const NO_ATTEMPT = { mitigated: 0, total: 0, percentage: 0, attempts_count: 0, rows: [] as readonly unknown[] }

/** Solo el último intento del jugador en el nivel: reintentar reemplaza el %, no lo promedia. */
export const levelProgressOf = (levelId: string, risks: readonly unknown[], rows: readonly unknown[]) => {
  const latest = latestAttemptByLevel(rows)[0] ?? NO_ATTEMPT
  return {
    level_id: levelId, completion: `${latest.mitigated}/${latest.total}`, percentage: latest.percentage,
    attempts: latest.attempts_count, risks: risks.map(plainOf).map(riskProgress(latest.rows.map(plainOf))),
  }
}
