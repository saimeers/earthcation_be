import { describe, expect, it } from 'vitest'
import {
  AttemptRequiredError, EventBatch, EventsRequiredError, EventTypeRequiredError, LevelKeyRequiredError,
  levelProgressOf, NewAttemptInput, RiskRequiredError, RiskResultInput, toAttemptPatch,
} from '../../src'

describe('entradas del juego', () => {
  it('resultado por riesgo exige risk_id', () => {
    expect(() => RiskResultInput.from({})).toThrow(RiskRequiredError)
    expect(() => RiskResultInput.from({})).toThrow('risk_id es requerido')
    expect(RiskResultInput.from({ risk_id: 'CR-01', is_mitigated: true }).values).toMatchObject({ isMitigated: true, mistakesCount: 0 })
  })

  it('nuevo intento exige level_key y recorta la versión del juego', () => {
    expect(() => NewAttemptInput.from({})).toThrow(LevelKeyRequiredError)
    const input = NewAttemptInput.from({ level_key: 'level2', game_version: '1.2.3-muy-larga-version-x' })
    expect(input).toMatchObject({ levelKey: 'level2', sessionId: null, values: { gameVersion: '1.2.3-muy-larga-vers' } })
  })

  it('lote de eventos valida intento y contenido', () => {
    expect(() => EventBatch.from({ events: [{ event_type: 'x' }] })).toThrow(AttemptRequiredError)
    expect(() => EventBatch.from({ attempt_id: 'a', events: [] })).toThrow(EventsRequiredError)
    expect(() => EventBatch.from({ attempt_id: 'a', events: [{ event_type: 'x' }, null] })).toThrow(EventTypeRequiredError)
    const batch = EventBatch.from({ attempt_id: 'a', events: [{ event_type: 'x', risk_id: 'R' }] })
    expect(batch.rows('u1')).toEqual([{ attempt_id: 'a', user_id: 'u1', event_type: 'x', risk_id: 'R', stage: null, t_ms: null, pos_x: null, health: null, fatigue: null, payload: null }])
  })

  it('cerrar un intento pone la hora salvo si sigue en curso; ignora campos no permitidos', () => {
    const now = new Date(0)
    expect(toAttemptPatch({ outcome: 'failed', user_id: 'otro' }, now)).toEqual({ outcome: 'failed', ended_at: now })
    expect(toAttemptPatch({ outcome: 'in_progress' }, now)).toEqual({ outcome: 'in_progress' })
  })

  it('progreso del nivel sin datos', () => {
    expect(levelProgressOf('3', [{ id: 'R', name: 'Gas', category: 'Q' }], [])).toEqual({
      level_id: '3', completion: '0/0', percentage: 0, attempts: 0,
      risks: [{ risk_id: 'R', risk_name: 'Gas', category: 'Q', mitigated: false, last_mistakes: null, last_reaction_ms: null }],
    })
  })
})
