import { groupBy, keyOf, maxBy, sum } from '../../shared/collections'
import { latestAttemptByLevel, round, summarize, summarizeAttempts, summarizeRisks, type LatestAttempt } from '@earthcation/model'

// Detalle de una sesión para el panel, calculado sin E/S a partir de 3 consultas (sesión con participantes,
// resultados por riesgo de la sesión e intentos de nivel de la sesión). Las claves son las de v1.

export type Plain = Readonly<Record<string, unknown>>
export type DetailInput = { readonly session: Plain; readonly results: readonly Plain[]; readonly attempts: readonly Plain[] }

export type Band = 'destacado' | 'en_progreso' | 'refuerzo' | 'sin_datos'

// Banda de desempeño por % de mitigación: misma escala que el panel web y el Excel
export const performanceBand = (percentage: number, hasData: boolean): Band =>
  !hasData ? 'sin_datos' : percentage >= 80 ? 'destacado' : percentage >= 40 ? 'en_progreso' : 'refuerzo'

export const avg = (values: readonly unknown[]): number | null => {
  const v = values.filter((x): x is number => typeof x === 'number' && !Number.isNaN(x))
  return v.length > 0 ? sum(v) / v.length : null
}

const roundOrNull = (v: number | null): number | null => (v === null ? null : Math.round(v))
const obj = (v: unknown): Plain => (v !== null && typeof v === 'object' ? (v as Plain) : {})
const count = <T>(rows: readonly T[], pred: (r: T) => boolean): number => rows.filter(pred).length
const outcomeIs = (outcome: string) => (a: Plain) => a.outcome === outcome
const text = (v: unknown): string => (typeof v === 'string' ? v : '')

// Un objeto de JS ordena primero las claves numéricas (ascendente) y luego el resto en orden de inserción:
// v1 armaba "by_level" así, con el id del nivel o 'unknown' como clave
const asObjectOrder = <T>(entries: readonly (readonly [string, T])[]): readonly T[] => {
  const isIndex = (k: string) => /^(0|[1-9]\d*)$/.test(k)
  const numeric = entries.filter(([k]) => isIndex(k)).toSorted(([a], [b]) => Number(a) - Number(b))
  return [...numeric, ...entries.filter(([k]) => !isIndex(k))].map(([, v]) => v)
}

const levelKey = (v: unknown): string => (v == null ? 'unknown' : keyOf(v))

// ── Por participante ──────────────────────────────────────────────────────────

const riskRow = (p: Plain) => {
  const risk = obj(p.risk)
  return {
    risk_id: p.risk_id, risk_name: risk.name, category: risk.category, is_mitigated: p.is_mitigated,
    mistakes_count: p.mistakes_count, reaction_time_ms: p.reaction_time_ms, recorded_at: p.recorded_at,
  }
}

// Agrupa por nivel el último intento (se mantiene por compatibilidad con el panel)
const byLevel = (latest: readonly LatestAttempt<Plain>[]) => asObjectOrder(latest.map((l) => [levelKey(l.level_id), {
  name: obj(obj(l.rows[0]?.risk).level).name ?? 'Sin nivel', total: l.total, mitigated: l.mitigated, attempts: l.attempts_count,
  risks: l.rows.map(riskRow),
}] as const))

const topFailReason = (attempts: readonly Plain[]) => {
  const groups = [...groupBy(attempts.filter(outcomeIs('failed')), (a) => text(a.fail_reason) || 'desconocido')]
  const top = maxBy(groups, ([, g]) => g.length)
  return top ? { reason: top[0], count: top[1].length } : null
}

// Recorrido intento a intento por nivel, para los puntos ✓/✗/↩ de la tabla
const journeys = (attempts: readonly Plain[]) => Object.fromEntries([...groupBy(attempts, (a) => text(a.level_key))]
  .map(([key, group]) => [key, group.map((a) => ({
    id: a.id, attempt_number: a.attempt_number, outcome: a.outcome, fail_reason: a.fail_reason, fail_stage: a.fail_stage, duration_ms: a.duration_ms,
  }))]))

const bestTime = (levels: ReturnType<typeof summarizeAttempts>): number | null =>
  levels.reduce<number | null>((m, l) => (l.best_time_ms !== null && (m === null || l.best_time_ms < m) ? l.best_time_ms : m), null)

const telemetry = (attempts: readonly Plain[]) => {
  const levels = summarizeAttempts(attempts)
  return {
    attempts: attempts.length, completed: count(attempts, outcomeIs('completed')), failed: count(attempts, outcomeIs('failed')),
    abandoned: count(attempts, outcomeIs('abandoned')), best_time_ms: bestTime(levels), total_time_ms: sum(levels.map((l) => l.total_time_ms)),
    top_fail_reason: topFailReason(attempts), levels, journeys: journeys(attempts),
  }
}

// % del último intento de cada nivel (reintentar reemplaza, no promedia); el detalle de riesgos y la
// telemetría siguen mostrando todo el historial de la sesión
const scores = (results: readonly Plain[]) => {
  const latest = latestAttemptByLevel(results)
  const latestRows = latest.flatMap((l) => l.rows)
  const s = summarize(latestRows)
  return {
    latest, s, mistakes: sum(latestRows.map((p) => Number(p.mistakes_count ?? 0) || 0)),
    reaction: roundOrNull(avg(latestRows.map((p) => p.reaction_time_ms))),
  }
}

const whoIs = (su: Plain) => {
  const user = obj(su.user)
  return {
    user: su.user, organization: obj(obj(user.profile).organization).name ?? null, joined_at: su.joined_at,
    dominant_style: text(obj(user.varkProfile).dominant_style) || null,
  }
}

const participant = (results: readonly Plain[], attempts: readonly Plain[]) => (su: Plain) => {
  const { latest, s, mistakes, reaction } = scores(results)
  const risks = summarizeRisks(results)
  return {
    ...whoIs(su), total_attempts: s.total, mitigated: s.mitigated, percentage: s.percentage,
    level_attempts: sum(latest.map((l) => l.attempts_count)), mistakes_total: mistakes, // mismo universo que total_attempts
    avg_reaction_ms: reaction, band: performanceBand(s.percentage, s.total > 0), by_level: byLevel(latest),
    risks, weakest_risk: risks.find((r) => r.failed > 0) ?? null, telemetry: telemetry(attempts),
  }
}

export type Participant = ReturnType<ReturnType<typeof participant>>

// ── Sesión completa ───────────────────────────────────────────────────────────

// Riesgos de la sesión completa, ordenados por tasa de fallo
const sessionRisks = (results: readonly Plain[]) => summarizeRisks(results)
  .map((r) => ({ ...r, fail_rate: r.results ? round((r.failed / r.results) * 100) : null }))
  .toSorted((a, b) => (b.fail_rate ?? 0) - (a.fail_rate ?? 0))

const failReasons = (attempts: readonly Plain[]) =>
  [...groupBy(attempts.filter(outcomeIs('failed')), (a) => `${text(a.level_key)}|${text(a.fail_reason) || 'desconocido'}|${text(a.fail_stage)}`)]
    .map(([key, group]) => {
      const [level_key, fail_reason, fail_stage] = key.split('|')
      return { level_key, fail_reason, fail_stage: fail_stage || null, count: group.length }
    })
    .toSorted((a, b) => b.count - a.count)

const BAND_ORDER: readonly Band[] = ['destacado', 'en_progreso', 'refuerzo', 'sin_datos']

const bands = (participants: readonly Participant[]) =>
  Object.fromEntries(BAND_ORDER.map((b) => [b, count(participants, (p) => p.band === b)]))

const pct = (part: number, total: number): number | null => (total ? Math.round((part / total) * 100) : null)

const summaryOf = (participants: readonly Participant[], results: readonly Plain[], attempts: readonly Plain[]) => {
  const withData = participants.filter((p) => p.total_attempts > 0)
  const completed = count(attempts, outcomeIs('completed'))
  return {
    participants: participants.length, with_data: withData.length, avg_percentage: roundOrNull(avg(withData.map((p) => p.percentage))),
    avg_reaction_ms: roundOrNull(avg(participants.map((p) => p.avg_reaction_ms))), risk_results: results.length,
    risk_mitigated: count(results, (p) => p.is_mitigated === true), level_attempts: attempts.length, level_completed: completed,
    level_failed: count(attempts, outcomeIs('failed')), completion_rate: pct(completed, attempts.length), bands: bands(participants),
  }
}

const participantsOf = (d: DetailInput): readonly Participant[] => {
  const results = groupBy(d.results, (r) => r.user_id)
  const attempts = groupBy(d.attempts, (a) => a.user_id)
  const list = Array.isArray(d.session.participants) ? (d.session.participants as Plain[]) : []
  return list.map((su) => participant(results.get(su.user_id) ?? [], attempts.get(su.user_id) ?? [])(su))
}

export const sessionDetail = (d: DetailInput) => {
  const participants = participantsOf(d)
  return {
    session: d.session, summary: summaryOf(participants, d.results, d.attempts), risks: sessionRisks(d.results),
    levels: summarizeAttempts(d.attempts), fail_reasons: failReasons(d.attempts), participants,
  }
}

export type SessionDetail = ReturnType<typeof sessionDetail>
