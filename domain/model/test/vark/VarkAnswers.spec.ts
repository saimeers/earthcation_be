import { describe, expect, it } from 'vitest'
import {
  InvalidVarkStyleError, parseVarkStyle, VarkAnswers, VarkAnswersRequiredError, VarkResult,
} from '../../src'

const score = (answers: unknown) => VarkAnswers.from(answers).score()

describe('puntaje VARK', () => {
  it('cuenta cada respuesta en su canal', () => {
    expect(score({ q1: 'B', q2: 'C', q3: 'A', q4: 'B' })).toEqual({ visual: 4, auditory: 0, reading: 0, dominantStyle: 'Visual' })
    expect(score({ q1: 'C', q2: 'A', q3: 'B', q4: 'A' })).toEqual({ visual: 0, auditory: 3, reading: 1, dominantStyle: 'Auditivo' })
    expect(score({ q1: 'A', q2: 'B', q3: 'C', q4: 'B' })).toEqual({ visual: 1, auditory: 0, reading: 3, dominantStyle: 'Lector/Escritor' })
  })

  it('en empate gana visual, luego auditivo, luego lector', () => {
    expect(score({ q1: 'A', q2: 'C' }).dominantStyle).toBe('Visual') // lector 1, visual 1
    expect(score({ q1: 'A', q2: 'A' }).dominantStyle).toBe('Auditivo') // lector 1, auditivo 1
    expect(score({}).dominantStyle).toBe('Visual')
  })

  it('ignora preguntas y respuestas que no existen', () => {
    expect(score({ q9: 'A', q1: 'Z', q2: 1 })).toEqual({ visual: 0, auditory: 0, reading: 0, dominantStyle: 'Visual' })
  })

  it('exige el objeto answers', () => {
    expect(() => VarkAnswers.from(null)).toThrow(VarkAnswersRequiredError)
    expect(() => VarkAnswers.from(undefined)).toThrow('Se requiere el objeto answers')
    expect(() => VarkAnswers.from('A')).toThrow(VarkAnswersRequiredError)
  })
})

describe('estilo VARK', () => {
  it('acepta solo los tres estilos', () => {
    expect(parseVarkStyle('Lector/Escritor')).toBe('Lector/Escritor')
    expect(() => parseVarkStyle('Kinestésico')).toThrow(InvalidVarkStyleError)
    expect(() => parseVarkStyle('visual')).toThrow('Estilo inválido. Usa: Visual, Auditivo, Lector/Escritor')
  })
})

describe('VarkResult', () => {
  it('se restaura con sus puntajes', () => {
    const r = VarkResult.restore({ id: 'v1', userId: 'u1', visual: 2, auditory: 1, reading: 1, dominantStyle: 'Visual' })
    expect([r.id, r.userId, r.visual, r.auditory, r.reading, r.dominantStyle]).toEqual(['v1', 'u1', 2, 1, 1, 'Visual'])
    expect(r.toProps()).toMatchObject({ userId: 'u1', dominantStyle: 'Visual' })
  })
})
