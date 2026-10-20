import { describe, expect, it } from 'vitest'
import { ConflictError, DomainError, NotFoundError, ValidationError } from '../../src'

class SessionNotFoundError extends NotFoundError {
  constructor() { super('SESSION_NOT_FOUND', 'Sesión no encontrada') }
}

describe('DomainError', () => {
  it('cada subclase lleva su kind, código y mensaje', () => {
    const e = new SessionNotFoundError()
    expect(e).toBeInstanceOf(DomainError)
    expect(e).toBeInstanceOf(Error)
    expect([e.kind, e.code, e.message, e.name]).toEqual(['not_found', 'SESSION_NOT_FOUND', 'Sesión no encontrada', 'SessionNotFoundError'])
  })

  it('validación con detalles', () => {
    const e = new ValidationError('VALIDATION_ERROR', 'Dato inválido', { field: 'cedula' })
    expect([e.kind, e.details]).toEqual(['validation', { field: 'cedula' }])
    expect(new ConflictError('X', 'y').kind).toBe('conflict')
  })
})
