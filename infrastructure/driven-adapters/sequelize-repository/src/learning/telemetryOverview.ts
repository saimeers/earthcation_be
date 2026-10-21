import { col, fn, Op } from 'sequelize'
import { round, type SessionFilter } from '@earthcation/model'
import type { Models } from '../models'
import { BY_COUNT, COUNT, defined, eventCounts, raw, sumWhen, type Fields } from './queries'

// Vista global de telemetría para el panel: qué niveles cuestan más, de qué mueren, qué riesgo falla más.
// Agregación en Postgres; aquí solo se convierten los números (COUNT/SUM llegan como texto).

const n = (v: unknown): number => Number(v ?? 0)

const byLevel = (m: Models, where: Fields) => raw(m.LevelAttempt, {
  where, group: ['level_key', 'outcome'], attributes: ['level_key', 'outcome', [COUNT, 'count'],
    [fn('AVG', col('duration_ms')), 'avg_duration_ms'], [fn('COUNT', fn('DISTINCT', col('user_id'))), 'players']],
})

const failReasons = (m: Models, where: Fields) => raw(m.LevelAttempt, {
  where: { ...where, outcome: 'failed' }, group: ['level_key', 'fail_reason', 'fail_risk_id', 'fail_stage'],
  attributes: ['level_key', 'fail_reason', 'fail_risk_id', 'fail_stage', [COUNT, 'count']], order: BY_COUNT,
})

const retries = (m: Models, where: Fields) => raw(m.LevelAttempt, {
  where, group: ['level_key'],
  attributes: ['level_key', [fn('AVG', col('attempt_number')), 'avg_attempt_number'], [fn('MAX', col('attempt_number')), 'max_attempt_number']],
})

const brands = (m: Models, where: Fields) => raw(m.LevelAttempt, {
  where: { ...where, gas_brand: { [Op.ne]: null } }, group: ['gas_brand'],
  attributes: ['gas_brand', [COUNT, 'count'], [sumWhen('device_calibrated'), 'calibrated']],
})

const risks = (m: Models, where: Fields) => m.UserRiskProgress.findAll({
  where, raw: true, nest: true, group: ['risk_id', 'risk.id'],
  include: [{ model: m.Risk, as: 'risk', attributes: ['name', 'category'] }],
  attributes: ['risk_id', [fn('COUNT', col('UserRiskProgress.id')), 'results'], [sumWhen('is_mitigated'), 'mitigated'],
    [fn('SUM', col('mistakes_count')), 'mistakes_total'], [fn('AVG', col('reaction_time_ms')), 'avg_reaction_ms']],
}) as unknown as Promise<readonly Fields[]>

const riskV1 = (r: Fields) => {
  const results = n(r.results)
  const mitigated = n(r.mitigated)
  const risk = (r.risk ?? {}) as Fields
  return {
    risk_id: r.risk_id, risk_name: risk.name ?? null, category: risk.category ?? null, results, mitigated, failed: results - mitigated,
    fail_rate: results ? round(((results - mitigated) / results) * 100) : null, mistakes_total: n(r.mistakes_total),
    avg_reaction_ms: round(r.avg_reaction_ms, 0),
  }
}

type Section = readonly [string, Promise<readonly unknown[]>]

const sections = (m: Models, where: Fields, sessionId?: string): readonly Section[] => [
  ['levels', byLevel(m, where).then((rs) => rs.map((r) => ({ ...r, count: n(r.count), players: n(r.players), avg_duration_ms: round(r.avg_duration_ms, 0) })))],
  ['fail_reasons', failReasons(m, where).then((rs) => rs.map((r) => ({ ...r, count: n(r.count) })))],
  ['retries', retries(m, where).then((rs) => rs.map((r) => ({ level_key: r.level_key, avg_attempt_number: round(r.avg_attempt_number, 2), max_attempt_number: n(r.max_attempt_number) })))],
  ['gas_brands', brands(m, where).then((rs) => rs.map((r) => ({ gas_brand: r.gas_brand, attempts: n(r.count), calibrated: n(r.calibrated) })))],
  ['risks', risks(m, where).then((rs) => rs.map(riskV1).toSorted((a, b) => (b.fail_rate ?? 0) - (a.fail_rate ?? 0)))],
  ['event_counts', eventCounts(m, {}, { sessionId, ordered: true }).then((rs) => rs.map((e) => ({ event_type: e.event_type, count: n(e.count) })))],
]

export const telemetryOverview = async (m: Models, f: SessionFilter): Promise<Fields> => {
  const parts = sections(m, defined({ session_id: f.sessionId }) as Fields, f.sessionId)
  const values = await Promise.all(parts.map(([, query]) => query))
  return Object.fromEntries(parts.map(([name], i) => [name, values[i]]))
}
