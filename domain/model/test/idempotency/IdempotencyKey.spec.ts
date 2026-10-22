import { describe, expect, it } from 'vitest'
import { IdempotencyKey, IdempotencyKeyInvalidError } from '../../src'

describe('IdempotencyKey', () => {
  it('acepta un UUID y claves de 8 a 128 caracteres con . _ : -', () => {
    expect(IdempotencyKey.of('3f2b8d9e-1c4a-4e7b-9a55-0d6f7a1b2c3d').value).toBe('3f2b8d9e-1c4a-4e7b-9a55-0d6f7a1b2c3d')
    expect(IdempotencyKey.of('intento_1:evento.7').value).toBe('intento_1:evento.7')
    expect(IdempotencyKey.of('a'.repeat(128)).value).toHaveLength(128)
  })

  it('rechaza lo corto, lo largo, los espacios, los símbolos y lo que no es texto', () => {
    for (const bad of ['corta', 'a'.repeat(129), 'con espacio 123', 'raro/clave1', 'ñandú-clave1', '', undefined, 12345678, null]) {
      expect(() => IdempotencyKey.of(bad)).toThrow(IdempotencyKeyInvalidError)
    }
  })
})
