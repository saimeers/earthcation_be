import { keyOf } from '../shared/collections'
import { BANDS, failReasonLabel, levelLabel, OUTCOMES, SESSION_STATUS, stageLabel } from './labels'
import type { SessionRow, SessionDetail } from './detail'

// Contenido del Excel de la sesión como datos puros (filas por hoja); el adaptador de ExcelJS solo lo dibuja.

type Participant = SessionDetail['participants'][number]
export type Row = Readonly<Record<string, unknown>>
export type InfoLine = readonly [string, unknown] | null // null = fila en blanco

const obj = (v: unknown): SessionRow => (v !== null && typeof v === 'object' ? (v as SessionRow) : {})
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null)

export const msToDays = (ms: unknown): number | null => { const v = num(ms); return v === null ? null : v / 86400000 } // Excel guarda tiempos como fracción de día
export const secs = (ms: unknown): number | null => { const v = num(ms); return v === null ? null : Math.round(v / 100) / 10 }
// Excel no tiene zona horaria: se escribe la hora local de Colombia (UTC−5, sin horario de verano)
export const bogota = (d: unknown): Date | null =>
  typeof d === 'string' || d instanceof Date ? new Date(new Date(d).getTime() - 5 * 3600000) : null
export const fullName = (u: unknown): string =>
  [obj(u).first_name, obj(u).last_name].filter((x): x is string => typeof x === 'string' && x !== '').join(' ')

const durationMin = (s: SessionRow): number | null => typeof s.started_at === 'string' && typeof s.ended_at === 'string'
  ? Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000) : null

const place = (s: SessionRow): string => {
  const l = obj(s.location)
  return s.location ? `${keyOf(l.municipality)}, ${keyOf(l.department)}` : '—'
}

const fraction = (pct: number | null): number | string => (pct === null ? '—' : pct / 100)
const orDash = (v: unknown): unknown => v ?? '—'

const roomLines = (s: SessionRow): readonly InfoLine[] => [
  ['Sesión', s.name], ['Código de sala', s.is_free_play ? 'Juego libre (sin sala)' : s.code],
  ['Estado', SESSION_STATUS[keyOf(s.status)] ?? s.status], ['Instructor', fullName(s.instructor) || '—'], ['Localidad', place(s)],
]

const sessionLines = (s: SessionRow): readonly InfoLine[] => [
  ...roomLines(s), ['Inicio', orDash(bogota(s.started_at))], ['Fin', orDash(bogota(s.ended_at))], ['Duración (min)', orDash(durationMin(s))],
]

/** Hoja Resumen: datos de la sala, totales y cuántos participantes hay en cada banda de desempeño. */
export const summaryLines = (d: SessionDetail): readonly InfoLine[] => [
  ...sessionLines(d.session), null,
  ['Participantes', d.summary.participants], ['Participantes con resultados', d.summary.with_data],
  ['Mitigación promedio', fraction(d.summary.avg_percentage)], ['Resultados por riesgo registrados', d.summary.risk_results],
  ['Intentos de nivel', d.summary.level_attempts], ['Niveles completados', d.summary.level_completed],
  ['Tasa de finalización de niveles', fraction(d.summary.completion_rate)], ['Tiempo de reacción promedio (s)', secs(d.summary.avg_reaction_ms) ?? '—'],
  null, ...Object.entries(d.summary.bands).map(([k, v]): InfoLine => [`Desempeño: ${BANDS[k as keyof typeof BANDS]}`, v]),
]

const weakest = (p: Participant): string => p.weakest_risk ? `${keyOf(p.weakest_risk.risk_id)} · ${keyOf(p.weakest_risk.risk_name)}` : ''
const cause = (p: Participant): string => {
  const top = p.telemetry.top_fail_reason
  return top ? `${failReasonLabel(top.reason)} (${top.count})` : ''
}

export const participantRows = (participants: readonly Participant[]): readonly Row[] => participants.map((p) => ({
  cedula: obj(p.user).cedula ?? '', nombre: fullName(p.user), org: p.organization ?? '', vark: p.dominant_style ?? '', band: BANDS[p.band],
  pct: p.total_attempts ? p.percentage / 100 : null, total: p.total_attempts, mitigated: p.mitigated, mistakes: p.mistakes_total,
  reaction: secs(p.avg_reaction_ms), attempts: p.telemetry.attempts, completed: p.telemetry.completed, failed: p.telemetry.failed,
  abandoned: p.telemetry.abandoned, best: msToDays(p.telemetry.best_time_ms), weakest: weakest(p), cause: cause(p), _band: p.band,
}))

export const riskRows = (risks: SessionDetail['risks']): readonly Row[] => risks.map((k) => ({
  id: k.risk_id, name: k.risk_name, cat: k.category, level: k.level_name, results: k.results, mitigated: k.mitigated, failed: k.failed,
  rate: k.fail_rate !== null ? k.fail_rate / 100 : null, mistakes: k.mistakes_total, reaction: secs(k.avg_reaction_ms),
}))

const time = (d: unknown): number => (d instanceof Date ? d.getTime() : 0)

// Una fila por resultado del último intento de cada nivel, por nombre y luego por fecha
export const resultRows = (participants: readonly Participant[]): readonly Row[] => participants
  .flatMap((p) => p.by_level.flatMap((l) => l.risks.map((k) => ({
    cedula: obj(p.user).cedula ?? '', nombre: fullName(p.user), level: l.name, id: k.risk_id, name: k.risk_name, cat: k.category,
    result: k.is_mitigated ? 'Mitigado' : 'Fallido', _ok: k.is_mitigated, mistakes: k.mistakes_count ?? 0,
    reaction: secs(k.reaction_time_ms), date: bogota(k.recorded_at),
  }))))
  .toSorted((a, b) => a.nombre.localeCompare(b.nombre) || time(a.date) - time(b.date))

const calibrated = (v: unknown): string => (v === null || v === undefined ? '' : v === false ? 'No' : 'Sí')

export const attemptRows = (attempts: readonly SessionRow[]): readonly Row[] => attempts.map((a) => ({
  cedula: obj(a.user).cedula ?? '', nombre: fullName(a.user), level: levelLabel(a.level_key), n: a.attempt_number,
  outcome: OUTCOMES[keyOf(a.outcome)] ?? a.outcome, _outcome: a.outcome, reason: failReasonLabel(a.fail_reason),
  stage: stageLabel(a.fail_stage), duration: msToDays(a.duration_ms), health: num(a.final_health) === null ? null : Math.round(a.final_health as number),
  brand: a.gas_brand ?? '', calibrated: calibrated(a.device_calibrated), start: bogota(a.started_at),
}))
