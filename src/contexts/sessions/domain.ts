import { forbidden, notFound, validation, type DomainError } from '../../shared/errors'
import { err, ok, type Result } from '../../shared/result'

// Sesiones de capacitación: el instructor abre una sala con un código de 3 dígitos (fácil de dictar), los
// jugadores se unen con él (o con el QR) y la sala pasa de 'waiting' a 'active' y a 'finished'. Cada localidad
// tiene además una sesión "Juego libre" (sin instructor ni código, siempre activa) para quien juega sin sala.

type Fields = Readonly<Record<string, unknown>>

export type Status = 'waiting' | 'active' | 'finished'

export type Session = {
  readonly id: string
  readonly instructorId: string | null
  readonly locationId: string | null
  readonly isFreePlay: boolean
  readonly status: Status
}

export type Requester = { readonly id: string; readonly role: string }

export const noAccess = (): DomainError => forbidden('SESSION_FORBIDDEN', 'Sesión no encontrada o sin permiso')
export const sessionNotFound = (): DomainError => notFound('SESSION_NOT_FOUND', 'Sesión no encontrada')
export const invalidCode = (): DomainError => notFound('SESSION_CODE_INVALID', 'Código de sesión inválido')
export const noLiveSession = (): DomainError =>
  notFound('SESSION_CODE_NOT_LIVE', 'Código de sesión inválido o la sesión ya finalizó')
export const notParticipant = (): DomainError => notFound('NOT_A_PARTICIPANT', 'El usuario no participa en esta sesión')
// v1 respondía 400 a estas reglas: se conservan como validación
export const sessionFinished = (): DomainError => validation('SESSION_FINISHED', 'Esta sesión ya ha finalizado')
const freePlayLocked = (): DomainError => validation('FREE_PLAY_LOCKED', 'La sesión de juego libre siempre está activa')

const present = (v: unknown): boolean => Boolean(v)

export type NewSession = { readonly name: unknown; readonly locationId: unknown }

export const toNewSession = (b: Fields): Result<NewSession, DomainError> => {
  if (!present(b.name)) return err(validation('SESSION_NAME_REQUIRED', 'El nombre de la sesión es requerido'))
  return present(b.location_id)
    ? ok({ name: b.name, locationId: b.location_id })
    : err(validation('SESSION_LOCATION_REQUIRED', 'La localidad (location_id) es requerida'))
}

export const toJoinCode = (b: Fields): Result<unknown, DomainError> =>
  present(b.code) ? ok(b.code) : err(validation('SESSION_CODE_REQUIRED', 'El código es requerido'))

export const toRoomCode = (code: string): Result<string, DomainError> =>
  /^\d{3}$/.test(code) ? ok(code) : err(validation('SESSION_CODE_FORMAT', 'El código de sala tiene 3 dígitos'))

/** Código de 3 dígitos ("042"): 1000 combinaciones; una sala finalizada libera el suyo. */
export const roomCode = (random: () => number): string => String(Math.floor(random() * 1000)).padStart(3, '0')

/** Solo el instructor dueño inicia o termina su sala; el Juego libre no se inicia ni se termina. */
export const canControl = (s: Session | null, instructorId: string): Result<Session, DomainError> =>
  s?.isFreePlay === true ? err(freePlayLocked()) : s !== null && s.instructorId === instructorId ? ok(s) : err(noAccess())

/** Dueño de la sala, o instructor de la misma localidad si es el Juego libre. */
export const canSee = (s: Session, instructorId: string, instructorLocation: string | null): boolean =>
  s.instructorId === instructorId || (s.isFreePlay && s.locationId === instructorLocation)

// Admin y desarrollador consultan todo (el desarrollador solo lectura)
export const seesEverything = (r: Requester): boolean => r.role === 'admin' || r.role === 'developer'
