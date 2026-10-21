import { describe, expect, it } from 'vitest'
import {
  assertCanControl, assertRoomCodeFormat, canSee, FreePlayLockedError, roomCode, SessionCodeFormatError, SessionForbiddenError,
  type RoomView,
} from '../../src'

const room: RoomView = { id: 's1', instructorId: 'i1', locationId: 'L', isFreePlay: false, status: 'waiting' }
const free: RoomView = { ...room, id: 'free', instructorId: null, isFreePlay: true, status: 'active' }

describe('reglas de sala', () => {
  it('código de 3 dígitos con ceros a la izquierda', () => {
    expect([roomCode(() => 0.042), roomCode(() => 0.9999)]).toEqual(['042', '999'])
    expect(() => assertRoomCodeFormat('12a')).toThrow(SessionCodeFormatError)
  })

  it('solo el dueño controla su sala; el Juego libre nunca', () => {
    expect(assertCanControl(room, 'i1')).toBe(room)
    expect(() => assertCanControl(room, 'otro')).toThrow(SessionForbiddenError)
    expect(() => assertCanControl(null, 'i1')).toThrow(SessionForbiddenError)
    expect(() => assertCanControl(free, 'i1')).toThrow(FreePlayLockedError)
    expect(() => assertCanControl(free, 'i1')).toThrow('La sesión de juego libre siempre está activa')
  })

  it('el Juego libre lo ve el instructor de la misma localidad', () => {
    expect([canSee(free, 'i9', 'L'), canSee(free, 'i9', 'otra'), canSee(room, 'i9', 'L')]).toEqual([true, false, false])
  })
})
