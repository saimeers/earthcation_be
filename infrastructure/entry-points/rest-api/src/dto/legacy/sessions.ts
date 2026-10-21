import type { JoinRoomResult, RoomReport } from '@earthcation/usecase'
import { keyOf, type SessionRow } from '@earthcation/model'

// Respuestas legacy de sesiones: la mayoría son filas crudas (read model); solo las escrituras llevan un mensaje.

export const createdRoomLegacy = (session: SessionRow) => ({ message: 'Sesión creada', session })

export const joinedRoomLegacy = (j: JoinRoomResult) =>
  (j.joined ? { session: j.session, joined: true } : { session: j.session, joined: false, message: 'Ya estás en esta sesión' })

export const startedRoomLegacy = (session: SessionRow) => ({ message: 'Sesión iniciada', session })

export const endedRoomLegacy = (session: SessionRow) => ({ message: 'Sesión finalizada', session })

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export const exportFilename = (report: RoomReport): string => {
  const date = new Date().toISOString().slice(0, 10)
  return `sesion-${keyOf(report.code)}-${date}.xlsx`
}
