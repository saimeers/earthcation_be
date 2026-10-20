import { describe, it, expect } from 'vitest'
import { ok, err, map, flatMap, andThen, fromNullable } from '../../src/legacy/shared/result'
import { notFound, businessRule, validation, httpStatusOf } from '../../src/legacy/shared/errors'
import { parseEnv } from '../../src/config/env'

describe('Result', () => {
  it('map y flatMap solo tocan el Ok', () => {
    expect(map(ok(2), x => x * 3)).toEqual(ok(6))
    expect(map(err('x'), x => x * 3)).toEqual(err('x'))
    expect(flatMap(ok(2), x => (x > 1 ? ok(x) : err('chico')))).toEqual(ok(2))
    expect(flatMap(ok(0), x => (x > 1 ? ok(x) : err('chico')))).toEqual(err('chico'))
  })

  it('andThen corta en el primer error', async () => {
    const calls = []
    const step = (v) => { calls.push(v); return ok(v + 1) }
    expect(await andThen(andThen(Promise.resolve(ok(1)), step), step)).toEqual(ok(3))
    expect(await andThen(err('falló'), step)).toEqual(err('falló'))
    expect(calls).toEqual([1, 2])
  })

  it('fromNullable', () => {
    expect(fromNullable(0, () => 'falta')).toEqual(ok(0))
    expect(fromNullable(null, () => 'falta')).toEqual(err('falta'))
  })
})

describe('errores de dominio', () => {
  it('estado HTTP por tipo', () => {
    expect(httpStatusOf(notFound('USER_NOT_FOUND', 'Usuario no encontrado'))).toBe(404)
    expect(httpStatusOf(validation('VALIDATION_ERROR', 'Dato inválido'))).toBe(400)
    expect(httpStatusOf(businessRule('SESSION_FINISHED', 'La sesión terminó'))).toBe(422)
  })

  it('details solo si se da', () => {
    expect(notFound('X', 'y')).toEqual({ kind: 'not_found', code: 'X', message: 'y' })
    expect(validation('X', 'y', { field: 'cedula' }).details).toEqual({ field: 'cedula' })
  })
})

describe('parseEnv', () => {
  const secret = 'a'.repeat(32)

  it('valores por defecto', () => {
    expect(parseEnv({ JWT_SECRET: secret })).toEqual(ok({ JWT_SECRET: secret, PORT: 3000, NODE_ENV: 'development' }))
  })

  it('JWT_SECRET corto o ausente impide arrancar', () => {
    expect(parseEnv({ JWT_SECRET: 'corto' })).toEqual(err(['JWT_SECRET: debe tener al menos 32 caracteres']))
    expect(parseEnv({})).toEqual(err(['JWT_SECRET: falta']))
  })

  it('PORT se convierte a número', () => {
    expect(parseEnv({ JWT_SECRET: secret, PORT: '8080' })).toMatchObject({ ok: true, value: { PORT: 8080 } })
  })
})
