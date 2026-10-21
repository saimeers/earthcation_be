import { describe, expect, it } from 'vitest'
import {
  joinCodeOf, NewRoomInput, SessionCodeRequiredError, SessionLocationRequiredError, SessionNameRequiredError,
} from '../../src'

describe('validaciones de creación y unión', () => {
  it('abrir sala exige nombre y localidad', () => {
    expect(() => NewRoomInput.from({ location_id: 'L' })).toThrow(SessionNameRequiredError)
    expect(() => NewRoomInput.from({ location_id: 'L' })).toThrow('El nombre de la sesión es requerido')
    expect(() => NewRoomInput.from({ name: 'Sala' })).toThrow(SessionLocationRequiredError)
    expect(NewRoomInput.from({ name: 'Sala', location_id: 'L' })).toMatchObject({ name: 'Sala', locationId: 'L' })
  })

  it('unirse exige el código', () => {
    expect(() => joinCodeOf({})).toThrow(SessionCodeRequiredError)
    expect(joinCodeOf({ code: '042' })).toBe('042')
  })
})
