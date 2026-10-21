import { describe, expect, it } from 'vitest'
import { hardestRisks, latestAttemptByLevel, levelProgress, round, summarizeAttempts, summarizeRisks } from '../../src'

const result = (user: string, attempt: string | null, mitigated: boolean, at: string, extra: Record<string, unknown> = {}) =>
  ({ user_id: user, attempt_id: attempt, is_mitigated: mitigated, recorded_at: at, risk: { level_id: 1 }, risk_id: 'CR-01', session_id: 's', ...extra })

describe('agregados', () => {
  it('intentos por nivel', () => {
    const [l1] = summarizeAttempts([
      { level_key: 'level1', outcome: 'failed', fail_reason: null, fail_stage: 'gas', duration_ms: 50 },
      { level_key: 'level1', outcome: 'completed', duration_ms: 90 },
      { level_key: 'level1', outcome: 'completed', duration_ms: 70 },
      { level_key: 'level1', outcome: 'in_progress' },
    ])
    expect(l1).toEqual({
      level_key: 'level1', attempts: 4, completed: 2, failed: 1, abandoned: 0, in_progress: 1, retries: 3,
      attempts_until_first_completion: 2, best_time_ms: 70, total_time_ms: 210, fail_reasons: { desconocido: 1 }, fail_stages: { gas: 1 },
    })
  })

  it('riesgos: primero el que más falla', () => {
    const risks = summarizeRisks([
      { risk_id: 'A', is_mitigated: true, mistakes_count: 1, reaction_time_ms: 100, risk: { name: 'a', level: { name: 'N1' } } },
      { risk_id: 'B', is_mitigated: false, mistakes_count: 2, reaction_time_ms: null },
      { risk_id: 'A', is_mitigated: false, reaction_time_ms: 300 },
    ])
    expect(risks.map((r) => [r.risk_id, r.failed, r.mitigation_rate, r.avg_reaction_ms, r.last_result])).toEqual([
      ['B', 1, 0, null, 'failed'], ['A', 1, 50, 200, 'failed'],
    ])
    expect(risks[1]).toMatchObject({ risk_name: 'a', level_name: 'N1', mistakes_total: 1 })
  })

  it('riesgos más fallados y progreso por nivel', () => {
    const rows = [result('u1', 'a', false, '2026-01-01', { risk_id: 'X', mistakes_count: 3 }), result('u1', 'a', true, '2026-01-01', { risk_id: 'Y' })]
    expect(hardestRisks(rows).map((r) => [r.risk_id, r.fail_rate, r.avg_mistakes])).toEqual([['X', 100, 3], ['Y', 0, 0]])
    expect(levelProgress({ id: 1, name: 'Nivel 1' }, latestAttemptByLevel(rows)))
      .toEqual({ level: 'Nivel 1', percentage: 50, mitigated: 1, total: 2, players: 1, players_100: 0, avg_attempts: 1 })
    expect([round(2.345, 2), round(null), round('7.25')]).toEqual([2.35, null, 7.3])
  })
})
