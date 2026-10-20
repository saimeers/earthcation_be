import { err, ok, type Result } from '../../shared/result'
import type { DomainError } from '../../shared/errors'
import { groupBy, keyOf, sum } from '../../shared/collections'
import { round } from '../learning/summaries'
import { avg, type Plain, type SessionDetail } from './detail'
import { notParticipant } from './domain'

// Análisis de un participante dentro de su sesión: lo suyo + promedios del grupo para comparar, sus intentos
// (sin eventos: la línea de tiempo se pide aparte por intento), lectura de paneles y navegación.

type Participant = SessionDetail['participants'][number]

export type AnalysisInput = {
  readonly detail: SessionDetail
  readonly userId: string
  readonly user: Plain | null
  readonly attempts: readonly Plain[]
  readonly eventCounts: readonly Plain[]
  readonly readTimes: readonly Plain[] // promedio de lectura de paneles por jugador de la sesión
}

const roundOr = (v: number | null, decimals = 0): number | null => (v === null ? null : round(v, decimals))
const userIdOf = (p: Participant | undefined): unknown => (p?.user as Plain | null | undefined)?.id ?? null

// Suma de los contadores numéricos que el juego deja en `summary` de cada intento
const summaryCounters = (attempts: readonly Plain[]) => Object.fromEntries([...groupBy(
  attempts.flatMap((a) => Object.entries((a.summary ?? {}) as Plain)).filter(([, v]) => typeof v === 'number'), ([k]) => k,
)].map(([k, entries]) => [k, sum(entries.map(([, v]) => v as number))]))

const reading = (readTimes: readonly Plain[], userId: string) => {
  const mine = readTimes.find((r) => r.user_id === userId)
  return {
    panels: mine ? Number(mine.panels) : 0, avg_read_ms: mine ? roundOr(Number(mine.avg_read_ms)) : null,
    group_avg_read_ms: roundOr(avg(readTimes.map((r) => Number(r.avg_read_ms)))),
  }
}

type LevelStats = Participant['telemetry']['levels'][number]

const levelGroups = (others: readonly Participant[]) => Object.fromEntries([...groupBy(others.flatMap((p) => p.telemetry.levels), (l: LevelStats) => l.level_key)]
  .map(([key, levels]) => [key, {
    avg_attempts_until_first_completion: roundOr(avg(levels.map((l) => l.attempts_until_first_completion)), 1),
    avg_best_time_ms: roundOr(avg(levels.map((l) => l.best_time_ms))),
  }]))

const group = (d: SessionDetail, me: Participant) => {
  // Promedios del grupo: solo participantes con datos
  const others = d.participants.filter((p) => p.total_attempts > 0 || p.telemetry.attempts > 0)
  return {
    participants: d.summary.participants, avg_percentage: d.summary.avg_percentage, avg_reaction_ms: d.summary.avg_reaction_ms,
    avg_mistakes_per_result: roundOr(avg(others.filter((p) => p.total_attempts).map((p) => p.mistakes_total / p.total_attempts)), 2),
    avg_level_attempts: roundOr(avg(others.map((p) => p.telemetry.attempts)), 1),
    rank: 1 + d.participants.filter((p) => p.percentage > me.percentage).length, levels: levelGroups(others),
    risks: Object.fromEntries(d.risks.map((r) => [keyOf(r.risk_id), { mitigation_rate: r.mitigation_rate, avg_reaction_ms: r.avg_reaction_ms }])),
  }
}

const sessionOf = (s: Plain) => ({
  id: s.id, name: s.name, code: s.code, is_free_play: s.is_free_play, status: s.status, started_at: s.started_at, ended_at: s.ended_at,
})

const navigation = (list: readonly Participant[], index: number) =>
  ({ index, total: list.length, prev: userIdOf(list[index - 1]), next: userIdOf(list[index + 1]) })

export const participantIndex = (d: SessionDetail, userId: string): Result<number, DomainError> => {
  const index = d.participants.findIndex((p) => userIdOf(p) === userId)
  return index === -1 ? err(notParticipant()) : ok(index)
}

export const participantAnalysis = (input: AnalysisInput, index: number) => {
  const { detail: d } = input
  const me = d.participants[index] as Participant
  return {
    session: sessionOf(d.session), user: input.user, participant: me, attempts: input.attempts,
    summary_counters: summaryCounters(input.attempts),
    event_counts: Object.fromEntries(input.eventCounts.map((e) => [keyOf(e.event_type), Number(e.count)])),
    reading: reading(input.readTimes, input.userId), group: group(d, me), navigation: navigation(d.participants, index),
  }
}
