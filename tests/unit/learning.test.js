import { describe, it, expect } from 'vitest'
import { groupAttempts, latestAttemptByLevel, latestAttemptRows, levelOf, summarize } from '../../src/contexts/learning/attempts'
import { hardestRisks, levelProgress, round, summarizeAttempts, summarizeRisks } from '../../src/contexts/learning/summaries'
import { coordsFor } from '../../src/contexts/learning/geo'
import { levelProgressOf, toAttemptPatch, toEventBatch, toNewAttempt, toRiskResult } from '../../src/contexts/learning/domain'
import { makeLearning } from '../../src/contexts/learning/application'
import { countBy, groupBy, maxBy } from '../../src/shared/collections'

const result = (user, attempt, mitigated, at, extra = {}) => ({
  user_id: user, attempt_id: attempt, is_mitigated: mitigated, recorded_at: at, risk: { level_id: 1 }, risk_id: 'CR-01', session_id: 's', ...extra,
})

describe('colecciones', () => {
  it('agrupa y cuenta en orden de aparición; maxBy se queda con el primero en empate', () => {
    expect([...groupBy([3, 1, 4, 1, 5], (n) => n % 2)]).toEqual([[1, [3, 1, 1, 5]], [0, [4]]])
    expect(countBy(['b', 'a', 'b'], (x) => x)).toEqual({ b: 2, a: 1 })
    expect(maxBy(['aa', 'bb', 'c'], (s) => s.length)).toBe('aa')
  })
})

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
    expect(groupAttempts(rows)[1].attempts[0].key).toBe('sin-intento:s:2026-01-03')
  })

  it('nivel desde el riesgo o la fila; acepta instancias con get()', () => {
    expect(levelOf({ risk: { level: { id: 3 } } })).toBe(3)
    expect(levelOf({ level_id: 2 })).toBe(2)
    expect(summarize([{ get: () => ({ is_mitigated: true }) }, { is_mitigated: false }])).toEqual({ total: 2, mitigated: 1, percentage: 50 })
  })

  it('progreso del nivel sin datos', () => {
    expect(levelProgressOf('3', [{ id: 'R', name: 'Gas', category: 'Q' }], [])).toEqual({
      level_id: '3', completion: '0/0', percentage: 0, attempts: 0,
      risks: [{ risk_id: 'R', risk_name: 'Gas', category: 'Q', mitigated: false, last_mistakes: null, last_reaction_ms: null }],
    })
  })
})

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

describe('coordenadas DIVIPOLA', () => {
  it('nombres del catálogo contra los oficiales', () => {
    expect(coordsFor('Cúcuta', 'Norte de Santander')).toMatchObject({ code: '54001', exact: true })
    expect(coordsFor('Tumaco', 'Nariño')).toMatchObject({ exact: true })
    expect(coordsFor('Bogotá', 'Bogotá D.C.')).toMatchObject({ code: '11001', exact: true })
  })
  it('sin coincidencia cae a la capital; sin departamento, null', () => {
    expect(coordsFor('Pueblo Inventado', 'Antioquia')).toMatchObject({ code: '05001', exact: false })
    expect(coordsFor('X', 'Departamento Falso')).toBeNull()
  })
})

describe('entradas del juego', () => {
  it('validaciones', () => {
    expect(toRiskResult({}).error.message).toBe('risk_id es requerido')
    expect(toNewAttempt({ level_key: 'level2', game_version: '1.2.3-muy-larga-version-x' }).value)
      .toMatchObject({ levelKey: 'level2', sessionId: null, values: { game_version: '1.2.3-muy-larga-vers' } })
    expect(toEventBatch({ attempt_id: 'a', events: [] }).error.message).toBe('events debe ser un arreglo no vacío')
    expect(toEventBatch({ attempt_id: 'a', events: [{ event_type: 'x' }, null] }).error.message).toBe('cada evento requiere event_type')
  })
  it('cerrar un intento pone la hora salvo si sigue en curso; ignora campos no permitidos', () => {
    const now = new Date(0)
    expect(toAttemptPatch({ outcome: 'failed', user_id: 'otro' }, now)).toEqual({ outcome: 'failed', ended_at: now })
    expect(toAttemptPatch({ outcome: 'in_progress' }, now)).toEqual({ outcome: 'in_progress' })
  })
})

describe('casos de uso de aprendizaje', () => {
  const setup = () => {
    const saved = []
    const repo = {
      riskExists: async (id) => id === 'CR-01', attemptSession: async (id) => (id === 'mio' ? 'sala-del-intento' : null),
      saveResult: async (row) => { saved.push(row); return row },
      abandonOpen: async () => {}, countAttempts: async () => 2, levelIdForNumber: async (n) => Number(n),
      createAttempt: async (row) => row, ownsAttempt: async (id) => id === 'mio', updateAttempt: async (_id, patch) => patch, saveEvents: async () => {},
    }
    const cache = { remember: async (_e, compute) => compute(), setIfAbsent: async () => true }
    const deps = { repo, cache, reads: {}, analytics: {}, now: () => new Date(0), freeSessions: { resolve: async (_u, s) => s ?? 'juego-libre' } }
    return { l: makeLearning(deps), saved }
  }

  it('resultado sin sala usa la del intento o la sesión libre', async () => {
    const { l, saved } = setup()
    await l.saveProgress('u', { risk_id: 'CR-01', attempt_id: 'mio', is_mitigated: true })
    await l.saveProgress('u', { risk_id: 'CR-01' })
    expect(saved.map((r) => r.session_id)).toEqual(['sala-del-intento', 'juego-libre'])
    expect((await l.saveProgress('u', { risk_id: 'CR-99' })).error.code).toBe('RISK_NOT_FOUND')
  })

  it('intento nuevo numerado y con nivel por número; eventos solo en intentos propios', async () => {
    const { l } = setup()
    expect((await l.startAttempt('u', { level_key: 'level2' })).value).toMatchObject({ attempt_number: 3, level_id: 2, session_id: 'juego-libre' })
    expect(await l.saveEvents('u', { attempt_id: 'mio', events: [{ event_type: 'a' }, { event_type: 'b' }] })).toEqual({ ok: true, value: 2 })
    expect((await l.endAttempt('u', 'ajeno', {})).error.code).toBe('ATTEMPT_NOT_FOUND')
  })
})
