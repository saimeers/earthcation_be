import type {
  AnalysisQueryResult, CreateRoomInput, RoomByCode, RoomView, RoomWithResults,
  SessionDetail, SessionDetailReader, SessionRepository, SessionRow,
} from '@earthcation/model'

/** Salas de capacitación en memoria, para probar los casos de uso sin base de datos. */
export class InMemorySessionRepository implements SessionRepository {
  readonly rooms = new Map<string, RoomView>()
  /** `code -> id`: en Postgres se busca por código; aquí se indexa aparte. */
  readonly codeToId = new Map<string, string>()
  readonly enrolled = new Set<string>()
  readonly usedCodes = new Set<string>()
  private nextId = 0

  codeInUse(code: string) { return Promise.resolve(this.usedCodes.has(code)) }

  create(input: CreateRoomInput): Promise<SessionRow> {
    this.nextId += 1
    const id = `sala-${this.nextId}`
    this.rooms.set(id, { id, instructorId: input.instructorId, locationId: input.locationId as string | null, isFreePlay: false, status: 'waiting' })
    this.codeToId.set(input.code, id)
    this.usedCodes.add(input.code)
    return Promise.resolve({ id, instructor_id: input.instructorId, location_id: input.locationId, name: input.name, code: input.code, status: 'waiting' })
  }

  findByCode(code: unknown): Promise<RoomByCode | null> {
    const id = this.codeToId.get(String(code))
    const room = id ? this.rooms.get(id) : undefined
    return Promise.resolve(room ? { room, view: { id: room.id } } : null)
  }

  liveByCode(code: string): Promise<SessionRow | null> {
    const id = this.codeToId.get(code)
    const room = id ? this.rooms.get(id) : undefined
    return Promise.resolve(room && room.status !== 'finished' ? { id: room.id, status: room.status } : null)
  }

  isEnrolled(sessionId: string, userId: string) { return Promise.resolve(this.enrolled.has(`${sessionId}|${userId}`)) }

  enroll(sessionId: string, userId: string) { this.enrolled.add(`${sessionId}|${userId}`); return Promise.resolve() }

  find(id: string) { return Promise.resolve(this.rooms.get(id) ?? null) }

  update(id: string, values: SessionRow): Promise<SessionRow> {
    const room = this.rooms.get(id)
    if (room) this.rooms.set(id, { ...room, status: (values.status as RoomView['status']) ?? room.status })
    return Promise.resolve({ id, ...values })
  }

  profileLocation() { return Promise.resolve('L') }

  mine() { return Promise.resolve([]) }

  byLocation() { return Promise.resolve([]) }

  all() { return Promise.resolve([...this.rooms.values()] as unknown as readonly SessionRow[]) }

  withResults(): Promise<RoomWithResults | null> { return Promise.resolve(null) }

  analysisInput(): Promise<AnalysisQueryResult> { return Promise.resolve({ user: null, attempts: [], eventCounts: [], readTimes: [] }) }

  exportAttempts() { return Promise.resolve([]) }
}

/** Lector de detalle en memoria: devuelve lo que se le precargue. */
export class InMemorySessionDetailReader implements SessionDetailReader {
  byId = new Map<string, SessionDetail>()

  read(id: string) { return Promise.resolve(this.byId.get(id) ?? null) }
}
