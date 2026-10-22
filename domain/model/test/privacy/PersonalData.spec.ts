import { describe, expect, it } from 'vitest'
import { maskPersonalData } from '../../src'

describe('maskPersonalData', () => {
  it('oculta lo que identifica a una persona y deja lo demás, a cualquier profundidad', () => {
    const row = {
      id: 'u1', cedula: '1234567890', username: '1234567890', email: 'ana.perez@mina.co', first_name: 'Ana', last_name: 'Pérez', age: 41,
      role: 'player', varkProfile: { dominant_style: 'Visual', visual_score: 3 },
      profile: { organization: { name: 'Mina La Prueba' } },
      participants: [{ firstName: 'Luis', lastName: 'Gómez', percentage: 80 }],
    }
    expect(maskPersonalData(row)).toEqual({
      id: 'u1', cedula: '***890', username: '***890', email: '***@mina.co', first_name: 'A.', last_name: 'P.', age: null,
      role: 'player', varkProfile: { dominant_style: 'Visual', visual_score: 3 },
      profile: { organization: { name: 'Mina La Prueba' } },
      participants: [{ firstName: 'L.', lastName: 'G.', percentage: 80 }],
    })
  })

  it('no modifica el original y respeta nulos, vacíos y valores que no son texto', () => {
    const original = { cedula: '123456', email: null, first_name: '', age: null, createdAt: new Date(0), tags: ['a'] }
    const masked = maskPersonalData(original) as typeof original
    expect(original.cedula).toBe('123456')
    expect(masked).toEqual({ cedula: '***456', email: null, first_name: '', age: null, createdAt: new Date(0), tags: ['a'] })
  })

  it('un correo sin arroba y un valor que no es objeto', () => {
    expect(maskPersonalData({ email: 'sin-arroba' })).toEqual({ email: '***' })
    expect(maskPersonalData(5)).toBe(5)
    expect(maskPersonalData(null)).toBeNull()
  })
})
