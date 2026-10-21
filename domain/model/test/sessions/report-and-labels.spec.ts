import { describe, expect, it } from 'vitest'
import { bogota, failReasonLabel, levelLabel, resultRows, secs, stageLabel, type Participant } from '../../src'

describe('etiquetas en español', () => {
  it('etapa, nivel y causa de fallo', () => {
    expect([stageLabel('Methane2'), stageLabel('Otra'), stageLabel(null)]).toEqual(['Metano 2', 'Otra', ''])
    expect([levelLabel('level3'), levelLabel('reto_memoria'), levelLabel(undefined)]).toEqual(['Nivel 3', 'Reto de memoria', ''])
    expect([failReasonLabel('mordedura_ofidio'), failReasonLabel('nuevo'), failReasonLabel(null)]).toEqual(['Mordedura de serpiente', 'nuevo', ''])
  })
})

describe('filas del Excel', () => {
  it('hora de Colombia y segundos', () => {
    expect(bogota('2026-01-01T05:00:00Z')?.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect([secs(1550), secs(null)]).toEqual([1.6, null])
  })

  it('resultados por nombre y luego por fecha', () => {
    const participants = [
      { user: { first_name: 'Zoe' }, by_level: [{ name: 'N1', risks: [{ risk_id: 'R', is_mitigated: true, recorded_at: '2026-01-01T00:00:00Z' }] }] },
      { user: { first_name: 'Ana' }, by_level: [{ name: 'N1', risks: [{ risk_id: 'R', is_mitigated: false, recorded_at: '2026-01-02T00:00:00Z' }] }] },
    ] as unknown as readonly Participant[]
    expect(resultRows(participants).map((r) => [r.nombre, r.result])).toEqual([['Ana', 'Fallido'], ['Zoe', 'Mitigado']])
  })
})
