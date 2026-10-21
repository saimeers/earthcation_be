import { describe, expect, it } from 'vitest'
import { groupAttempts, latestAttemptByLevel, latestAttemptRows, levelOf, summarize } from '../../src'

const result = (user: string, attempt: string | null, mitigated: boolean, at: string, extra: Record<string, unknown> = {}) =>
  ({ user_id: user, attempt_id: attempt, is_mitigated: mitigated, recorded_at: at, risk: { level_id: 1 }, risk_id: 'CR-01', session_id: 's', ...extra })

describe('último intento', () => {
  const rows = [
    result('u1', 'a1', false, '2026-01-01T10:00:00Z'), result('u1', 'a1', true, '2026-01-01T10:01:00Z'),
    result('u1', 'a2', true, '2026-01-02T10:00:00Z'), result('u1', 'a2', true, '2026-01-02T10:01:00Z'),
    result('u2', null, false, '2026-01-03T08:00:00Z'), result('u2', null, true, '2026-01-03T09:00:00Z'),
  ]

  it('reintentar reemplaza el %, no lo promedia', () => {
    expect(latestAttemptByLevel(rows).map((l) => [l.user_id, l.attempts_count, l.percentage])).toEqual([['u1', 2, 100], ['u2', 1, 50]])
    expect(latestAttemptRows(rows)).toHaveLength(4)
  })

  it('sin attempt_id se agrupa por sesión y día', () => {
    expect(groupAttempts(rows)[1]?.attempts[0]?.key).toBe('sin-intento:s:2026-01-03')
  })

  it('nivel desde el riesgo o la fila; acepta instancias con get()', () => {
    expect(levelOf({ risk: { level: { id: 3 } } })).toBe(3)
    expect(levelOf({ level_id: 2 })).toBe(2)
    expect(summarize([{ get: () => ({ is_mitigated: true }) }, { is_mitigated: false }])).toEqual({ total: 2, mitigated: 1, percentage: 50 })
  })
})
