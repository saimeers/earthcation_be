import type { PlaceFilter } from '../../learning/gateways/AnalyticsReadModel'
import type { SessionRow } from '../detail'
import type { RoomView } from '../Room'

type Fields = Readonly<Record<string, unknown>>

export interface CreateRoomInput {
  readonly instructorId: string
  readonly locationId: unknown
  readonly name: unknown
  readonly code: string
}

export interface RoomByCode {
  readonly room: RoomView
  readonly view: SessionRow
}

export interface RoomWithResults {
  readonly session: SessionRow
  readonly results: readonly Fields[]
}

export interface AnalysisQueryResult {
  readonly user: Fields | null
  readonly attempts: readonly Fields[]
  readonly eventCounts: readonly Fields[]
  readonly readTimes: readonly Fields[]
}

/** Puerto de salida: salas de capacitación (crear, unirse, iniciar, terminar, listar, progreso simple). */
export interface SessionRepository {
  codeInUse(code: string): Promise<boolean>
  create(input: CreateRoomInput): Promise<SessionRow>
  /** La sala viva con ese código antes que una finalizada que lo usó (los códigos se reciclan). */
  findByCode(code: unknown): Promise<RoomByCode | null>
  liveByCode(code: string): Promise<SessionRow | null>
  isEnrolled(sessionId: string, userId: string): Promise<boolean>
  enroll(sessionId: string, userId: string): Promise<void>
  find(id: string): Promise<RoomView | null>
  update(id: string, values: Fields): Promise<SessionRow>
  profileLocation(userId: string): Promise<string | null>
  mine(instructorId: string, locationId: string | null): Promise<readonly SessionRow[]>
  byLocation(filter: PlaceFilter): Promise<readonly SessionRow[]>
  all(): Promise<readonly SessionRow[]>
  /** Sala con participantes (usuario + VARK) y sus resultados por riesgo, para el instructor dueño. */
  withResults(id: string): Promise<RoomWithResults | null>
  analysisInput(id: string, userId: string): Promise<AnalysisQueryResult>
  exportAttempts(id: string): Promise<readonly SessionRow[]>
}
