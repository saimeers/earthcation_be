import { describe, it, expect } from 'vitest'
import { scoreVark, toAnswers, toStyle } from '../../src/legacy/contexts/vark/domain'
import { makeVark } from '../../src/legacy/contexts/vark/application'

describe('puntaje VARK', () => {
  it('cuenta cada respuesta en su canal', () => {
    expect(scoreVark({ q1: 'B', q2: 'C', q3: 'A', q4: 'B' })).toEqual({ visual: 4, auditory: 0, reading: 0, dominantStyle: 'Visual' })
    expect(scoreVark({ q1: 'C', q2: 'A', q3: 'B', q4: 'A' })).toEqual({ visual: 0, auditory: 3, reading: 1, dominantStyle: 'Auditivo' })
  })

  it('en empate gana visual, luego auditivo, luego lector', () => {
    expect(scoreVark({ q1: 'A', q2: 'C' }).dominantStyle).toBe('Visual') // lector 1, visual 1
    expect(scoreVark({ q1: 'A', q2: 'A' }).dominantStyle).toBe('Auditivo') // lector 1, auditivo 1
    expect(scoreVark({}).dominantStyle).toBe('Visual')
  })

  it('ignora preguntas y respuestas que no existen', () => {
    expect(scoreVark({ q9: 'A', q1: 'Z', q2: 1 })).toEqual({ visual: 0, auditory: 0, reading: 0, dominantStyle: 'Visual' })
  })

  it('validaciones', () => {
    expect(toAnswers(null)).toMatchObject({ ok: false, error: { message: 'Se requiere el objeto answers' } })
    expect(toAnswers('A')).toMatchObject({ ok: false })
    expect(toStyle('Kinestésico')).toMatchObject({ ok: false, error: { message: 'Estilo inválido. Usa: Visual, Auditivo, Lector/Escritor' } })
    expect(toStyle('Lector/Escritor')).toEqual({ ok: true, value: 'Lector/Escritor' })
  })
})

describe('casos de uso VARK', () => {
  const saved = []
  const repo = {
    save: async (userId, scores) => { const created = !saved.some(s => s.userId === userId); saved.push({ userId, scores }); return { created } },
    findByUser: async () => null,
    listAll: async () => [], listByStyle: async () => [], listByPlace: async () => [],
  }
  const vark = makeVark(repo)

  it('el primer envío crea y el segundo reemplaza', async () => {
    expect(await vark.submit('u1', { q1: 'B' })).toMatchObject({ ok: true, value: { created: true, scores: { visual: 1 } } })
    expect(await vark.submit('u1', { q1: 'A' })).toMatchObject({ ok: true, value: { created: false } })
  })

  it('sin resultado guardado', async () => {
    expect(await vark.mine('u2')).toMatchObject({ ok: false, error: { kind: 'not_found' } })
  })
})
