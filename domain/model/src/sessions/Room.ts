import { FreePlayLockedError, SessionCodeFormatError, SessionForbiddenError } from './errors/SessionErrors'

// Sesiones de capacitación: el instructor abre una sala con un código de 3 dígitos (fácil de dictar), los
// jugadores se unen con él (o con el QR) y la sala pasa de 'waiting' a 'active' y a 'finished'. Cada localidad
// tiene además una sesión "Juego libre" (sin instructor ni código, siempre activa) para quien juega sin sala.

export type RoomStatus = 'waiting' | 'active' | 'finished'

/** Lo mínimo del estado de una sala para decidir permisos (no la fila completa). */
export interface RoomView {
  readonly id: string
  readonly instructorId: string | null
  readonly locationId: string | null
  readonly isFreePlay: boolean
  readonly status: RoomStatus
}

export interface Requester {
  readonly id: string
  readonly role: string
}

/** Código de 3 dígitos ("042"): 1000 combinaciones; una sala finalizada libera el suyo. */
export const roomCode = (random: () => number): string => String(Math.floor(random() * 1000)).padStart(3, '0')

export const assertRoomCodeFormat = (code: string): string => {
  if (!/^\d{3}$/.test(code)) throw new SessionCodeFormatError()
  return code
}

/** Solo el instructor dueño inicia o termina su sala; el Juego libre no se inicia ni se termina. */
export const assertCanControl = (room: RoomView | null, instructorId: string): RoomView => {
  if (room?.isFreePlay === true) throw new FreePlayLockedError()
  if (room === null || room.instructorId !== instructorId) throw new SessionForbiddenError()
  return room
}

/** Dueño de la sala, o instructor de la misma localidad si es el Juego libre. */
export const canSee = (room: RoomView, instructorId: string, instructorLocation: string | null): boolean =>
  room.instructorId === instructorId || (room.isFreePlay && room.locationId === instructorLocation)

// Admin y desarrollador consultan todo (el desarrollador solo lectura)
export const seesEverything = (r: Requester): boolean => r.role === 'admin' || r.role === 'developer'
