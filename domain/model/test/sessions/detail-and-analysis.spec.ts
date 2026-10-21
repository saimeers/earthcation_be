import { describe, expect, it } from 'vitest'
import {
  avg, NotAParticipantError, participantAnalysis, participantIndex, performanceBand, sessionDetail, type DetailInput,
} from '../../src'

const user = (id: string, name: string) =>
  ({ id, first_name: name, last_name: 'X', varkProfile: { dominant_style: 'Visual' }, profile: { organization: { name: 'Mina' } } })

const result = (u: string, attempt: string, ok: boolean, at: string, risk = 'CR-01') => ({
  user_id: u, attempt_id: attempt, risk_id: risk, is_mitigated: ok, mistakes_count: ok ? 0 : 2, reaction_time_ms: 1000,
  recorded_at: at, risk: { level_id: 1, name: risk, level: { id: 1, name: 'Nivel 1' } },
})

const input: DetailInput = {
  session: {
    id: 's1', name: 'Sala',
    participants: [{ user_id: 'a', user: user('a', 'Ana') }, { user_id: 'b', user: user('b', 'Beto') }, { user_id: 'c', user: user('c', 'Caro') }],
  },
  results: [
    result('a', 'a1', false, '2026-01-01T10:00:00Z'), result('a', 'a2', true, '2026-01-01T11:00:00Z'), result('a', 'a2', true, '2026-01-01T11:01:00Z', 'CR-02'),
    result('b', 'b1', false, '2026-01-01T10:00:00Z'), result('b', 'b1', true, '2026-01-01T10:01:00Z', 'CR-02'),
  ],
  attempts: [
    { id: 'a1', user_id: 'a', level_key: 'level1', outcome: 'failed', fail_reason: 'derrumbe', attempt_number: 1, duration_ms: 1000 },
    { id: 'a2', user_id: 'a', level_key: 'level1', outcome: 'completed', attempt_number: 2, duration_ms: 3000 },
    { id: 'b1', user_id: 'b', level_key: 'level1', outcome: 'failed', fail_reason: null, attempt_number: 1 },
  ],
}

describe('detalle de sesión', () => {
  const d = sessionDetail(input)

  it('bandas y resumen con el último intento', () => {
    expect(d.participants.map((p) => [p.percentage, p.band])).toEqual([[100, 'destacado'], [50, 'en_progreso'], [0, 'sin_datos']])
    expect(d.summary).toMatchObject({
      participants: 3, with_data: 2, avg_percentage: 75, level_attempts: 3, level_completed: 1, completion_rate: 33,
      bands: { destacado: 1, en_progreso: 1, refuerzo: 0, sin_datos: 1 },
    })
    expect(d.fail_reasons).toEqual([
      { level_key: 'level1', fail_reason: 'derrumbe', fail_stage: null, count: 1 },
      { level_key: 'level1', fail_reason: 'desconocido', fail_stage: null, count: 1 },
    ])
  })

  it('telemetría y recorrido por participante', () => {
    const [ana] = d.participants
    expect(ana).toMatchObject({ organization: 'Mina', dominant_style: 'Visual', level_attempts: 2, mistakes_total: 0 })
    expect(ana?.telemetry).toMatchObject({ attempts: 2, completed: 1, failed: 1, best_time_ms: 3000, total_time_ms: 4000, top_fail_reason: { reason: 'derrumbe', count: 1 } })
    expect(ana?.telemetry.journeys.level1?.map((j) => j.outcome)).toEqual(['failed', 'completed'])
    expect(ana?.by_level).toHaveLength(1)
    expect(ana?.by_level[0]).toMatchObject({ name: 'Nivel 1', total: 2, mitigated: 2, attempts: 2 })
  })

  it('análisis: posición, navegación y quien no participa', () => {
    expect(() => participantIndex(d, 'zz')).toThrow(NotAParticipantError)
    const index = participantIndex(d, 'b')
    const a = participantAnalysis({
      detail: d, userId: 'b', user: null, attempts: [{ summary: { saltos: 2 } }, { summary: { saltos: 1, nota: 'x' } }],
      eventCounts: [], readTimes: [{ user_id: 'b', panels: '3', avg_read_ms: '1500.4' }],
    }, index)
    expect(a.group.rank).toBe(2)
    expect(a.navigation).toEqual({ index: 1, total: 3, prev: 'a', next: 'c' })
    expect(a.summary_counters).toEqual({ saltos: 3 })
    expect(a.reading).toEqual({ panels: 3, avg_read_ms: 1500, group_avg_read_ms: 1500 })
  })

  it('utilidades', () => {
    expect([performanceBand(80, true), performanceBand(39, true), performanceBand(100, false)]).toEqual(['destacado', 'refuerzo', 'sin_datos'])
    expect([avg([1, null, 3]), avg([])]).toEqual([2, null])
  })
})
