import { describe, expect, it } from 'vitest'
import { camelize } from '../src/v1/dto/camelize'

describe('camelize', () => {
  it('convierte las claves a camelCase a cualquier profundidad y las fechas a ISO 8601', () => {
    const row = { first_name: 'Ana', profile: { organization_id: 'o', items: [{ is_active: true }] }, created_at: new Date('2026-10-01T10:00:00Z') }
    expect(camelize(row)).toEqual({
      firstName: 'Ana', profile: { organizationId: 'o', items: [{ isActive: true }] }, createdAt: '2026-10-01T10:00:00.000Z',
    })
  })

  it('conserva las claves de datos de los diccionarios y convierte sus valores', () => {
    const level = { level_key: 'level1', fail_reasons: { atmosfera_toxica: 2 }, fail_stages: { Sostenimiento: 1 }, journeys: { level_1: [{ attempt_number: 1 }] } }
    expect(camelize(level)).toEqual({
      levelKey: 'level1', failReasons: { atmosfera_toxica: 2 }, failStages: { Sostenimiento: 1 }, journeys: { level_1: [{ attemptNumber: 1 }] },
    })
  })

  it('un arreglo llamado fail_reasons (de objetos) sí se convierte', () => {
    expect(camelize({ fail_reasons: [{ fail_reason: 'derrumbe', level_key: 'level1' }] })).toEqual({ failReasons: [{ failReason: 'derrumbe', levelKey: 'level1' }] })
  })

  it('deja igual los valores simples, los nulos y las instancias que no son objetos planos', () => {
    expect(camelize(null)).toBeNull()
    expect(camelize(5)).toBe(5)
    expect(camelize('a_b')).toBe('a_b')
    expect(camelize({ a_b: null })).toEqual({ aB: null })
  })
})
