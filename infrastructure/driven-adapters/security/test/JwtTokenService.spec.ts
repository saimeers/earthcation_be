import jwt from 'jsonwebtoken'
import { describe, expect, it } from 'vitest'
import { JwtTokenService } from '../src'

const SECRET = 'a'.repeat(32)
const lifetime = (token: string): number => {
  const { exp, iat } = jwt.decode(token) as { exp: number, iat: number }
  return (exp - iat) / 3600
}

describe('JwtTokenService', () => {
  const tokens = new JwtTokenService(SECRET)

  it('el personal tiene sesiones de 24 horas y el jugador de 7 días', () => {
    for (const role of ['instructor', 'admin', 'developer'] as const) {
      expect(lifetime(tokens.issue({ id: 'u', username: '1', role }))).toBe(24)
    }
    expect(lifetime(tokens.issue({ id: 'u', username: '1', role: 'player' }))).toBe(24 * 7)
  })

  it('un payload firmado a mano sigue la misma regla según su rol', () => {
    expect(lifetime(tokens.sign({ id: 'u', role: 'admin' }))).toBe(24)
    expect(lifetime(tokens.sign({ id: 'u', role: 'player' }))).toBe(24 * 7)
  })

  it('verifica lo que firmó y rechaza otro secreto, otro algoritmo y basura', () => {
    const token = tokens.issue({ id: 'u1', username: '1', role: 'admin' })
    expect(tokens.verify(token)).toEqual({ id: 'u1', role: 'admin', username: '1' })
    expect(() => new JwtTokenService('b'.repeat(32)).verify(token)).toThrow()
    expect(() => tokens.verify(jwt.sign({ id: 'u', role: 'admin' }, SECRET, { algorithm: 'HS512' }))).toThrow()
    expect(() => tokens.verify('no-es-un-token')).toThrow()
  })
})
