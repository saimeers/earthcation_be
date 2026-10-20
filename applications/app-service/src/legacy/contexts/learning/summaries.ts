import { countBy, groupBy, sum } from '../../shared/collections'
import { plainOf, summarize, type LatestAttempt, type Plain } from './attempts'

// Agregados puros de la trazabilidad del juego. Las salidas conservan las claves snake_case de v1 porque
// también las arma session.service.js (detalle de sesión) con estas mismas funciones.

export const round = (v: unknown, decimals = 1): number | null =>
  v == null ? null : Math.round(Number(v) * 10 ** decimals) / 10 ** decimals

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0)
const textOr = (v: unknown, fallback: string): string => (typeof v === 'string' && v !== '' ? v : fallback)
const nested = (p: Plain, key: string): Plain => (p[key] !== null && typeof p[key] === 'object' ? (p[key] as Plain) : {})

// ── Intentos por nivel ────────────────────────────────────────────────────────

const firstCompletion = (attempts: readonly Plain[]): number | null => {
  const i = attempts.findIndex((a) => a.outcome === 'completed')
  return i === -1 ? null : i + 1
}

const bestTime = (completed: readonly Plain[]): number | null => {
  const times = completed.map((a) => num(a.duration_ms)).filter((ms) => ms > 0)
  return times.length > 0 ? Math.min(...times) : null
}

const failuresOf = (failed: readonly Plain[]) => ({
  fail_reasons: countBy(failed, (a) => textOr(a.fail_reason, 'desconocido')),
  fail_stages: countBy(failed.filter((a) => textOr(a.fail_stage, '') !== ''), (a) => textOr(a.fail_stage, '')),
})

const byOutcome = (attempts: readonly Plain[], outcome: string) => attempts.filter((a) => a.outcome === outcome)

const levelStats = (levelKey: string, attempts: readonly Plain[]) => {
  const [completed, failed, abandoned] = (['completed', 'failed', 'abandoned'] as const).map((o) => byOutcome(attempts, o)) as [Plain[], Plain[], Plain[]]
  return {
    level_key: levelKey, attempts: attempts.length, completed: completed.length, failed: failed.length,
    abandoned: abandoned.length, in_progress: attempts.length - completed.length - failed.length - abandoned.length,
    retries: attempts.length - 1, attempts_until_first_completion: firstCompletion(attempts), best_time_ms: bestTime(completed),
    total_time_ms: sum(attempts.map((a) => num(a.duration_ms))), ...failuresOf(failed),
  }
}

/** Intentos de nivel (en orden cronológico) por level_key: reintentos, intentos hasta completar, mejor tiempo, fallos. */
export const summarizeAttempts = (attempts: readonly unknown[]) =>
  [...groupBy(attempts.map(plainOf), (a) => textOr(a.level_key, ''))]
    .map(([key, group]) => levelStats(key, group))
    .toSorted((a, b) => a.level_key.localeCompare(b.level_key))

// ── Resultados por riesgo ─────────────────────────────────────────────────────

const reactionAvg = (rows: readonly Plain[]): number | null => {
  const times = rows.filter((r) => r.reaction_time_ms != null).map((r) => num(r.reaction_time_ms))
  return times.length > 0 ? round(sum(times) / times.length, 0) : null
}

const riskIdentity = (first: Plain) => {
  const risk = nested(first, 'risk')
  return { risk_id: first.risk_id, risk_name: risk.name ?? null, category: risk.category ?? null, level_name: nested(risk, 'level').name ?? null }
}

const riskStats = (rows: readonly Plain[]) => {
  const mitigated = rows.filter((r) => r.is_mitigated === true).length
  const last = rows.at(-1) ?? {}
  return {
    ...riskIdentity(rows[0] ?? {}), results: rows.length, mitigated, failed: rows.length - mitigated,
    mitigation_rate: round((mitigated / rows.length) * 100), mistakes_total: sum(rows.map((r) => num(r.mistakes_count))),
    avg_reaction_ms: reactionAvg(rows), last_result: last.is_mitigated === true ? 'mitigated' : 'failed', last_recorded_at: last.recorded_at,
  }
}

export type RiskSummary = ReturnType<typeof riskStats>

/** Resultados por riesgo (en orden cronológico), primero donde más se equivoca. */
export const summarizeRisks = (rows: readonly unknown[]): readonly RiskSummary[] =>
  [...groupBy(rows.map(plainOf), (r) => r.risk_id).values()].map(riskStats)
    .toSorted((a, b) => b.failed - a.failed || (a.mitigation_rate ?? 0) - (b.mitigation_rate ?? 0))

// ── Analítica global ─────────────────────────────────────────────────────────

const difficulty = (rows: readonly Plain[]) => {
  const first = rows[0] ?? {}
  const failed = rows.filter((r) => r.is_mitigated !== true).length
  return {
    risk_id: first.risk_id, name: nested(first, 'risk').name ?? first.risk_id, category: nested(first, 'risk').category ?? null,
    total_attempts: rows.length, failed, fail_rate: Math.round((failed / rows.length) * 100),
    avg_mistakes: Math.round((sum(rows.map((r) => num(r.mistakes_count))) / rows.length) * 10) / 10,
  }
}

/** Riesgos más fallados con TODO el historial (mide qué tan difícil es cada riesgo, reintentos incluidos). */
export const hardestRisks = (rows: readonly unknown[], top = 8) =>
  [...groupBy(rows.map(plainOf), (r) => r.risk_id).values()].map(difficulty)
    .toSorted((a, b) => b.fail_rate - a.fail_rate || b.total_attempts - a.total_attempts).slice(0, top)

const avgAttempts = (entries: readonly LatestAttempt<unknown>[]): number =>
  entries.length > 0 ? Math.round((sum(entries.map((l) => l.attempts_count)) / entries.length) * 10) / 10 : 0

/** Progreso de un nivel con el último intento de cada jugador. */
export const levelProgress = (level: { readonly id: unknown; readonly name: unknown }, latest: readonly LatestAttempt<unknown>[]) => {
  const entries = latest.filter((l) => l.level_id === level.id)
  const s = summarize(entries.flatMap((l) => l.rows))
  return {
    level: level.name, percentage: s.percentage, mitigated: s.mitigated, total: s.total, players: entries.length,
    players_100: entries.filter((l) => l.percentage === 100).length, avg_attempts: avgAttempts(entries),
  }
}

/** Resumen de un jugador: último intento de cada nivel y cuántos intentos de nivel hizo en total. */
export const playerSummary = (latest: readonly LatestAttempt<unknown>[]) => {
  const s = summarize(latest.flatMap((l) => l.rows))
  return { total_attempts: s.total, mitigated: s.mitigated, percentage: s.percentage, level_attempts: sum(latest.map((l) => l.attempts_count)) }
}
