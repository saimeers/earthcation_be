import type { Cache } from '../../ports/cache'
import type { DetailInput, Plain } from './detail'
import type { Session } from './domain'

type Rows = Promise<readonly Plain[]>

export type SessionRecord = { readonly session: Session; readonly view: Plain }
export type PlaceFilter = { readonly department?: string; readonly municipality?: string }

export type SessionRepository = {
  readonly codeInUse: (code: string) => Promise<boolean>
  readonly create: (s: { readonly instructorId: string; readonly locationId: unknown; readonly name: unknown; readonly code: string }) => Promise<Plain>
  // La sala viva con ese código antes que una finalizada que lo usó (los códigos se reciclan)
  readonly findByCode: (code: unknown) => Promise<SessionRecord | null>
  readonly liveByCode: (code: string) => Promise<Plain | null>
  readonly isEnrolled: (sessionId: string, userId: string) => Promise<boolean>
  readonly enroll: (sessionId: string, userId: string) => Promise<void>
  readonly find: (id: string) => Promise<Session | null>
  readonly update: (id: string, values: Plain) => Promise<Plain>
  readonly profileLocation: (userId: string) => Promise<string | null>
  readonly mine: (instructorId: string, locationId: string | null) => Rows
  readonly byLocation: (filter: PlaceFilter) => Rows
  readonly all: () => Rows
  // Sala con participantes (usuario + VARK) y sus resultados por riesgo, para el instructor dueño
  readonly withResults: (id: string) => Promise<{ readonly session: Plain; readonly results: readonly Plain[] } | null>
  readonly detailInput: (id: string) => Promise<DetailInput | null>
  readonly analysisInput: (id: string, userId: string) => Promise<{
    readonly user: Plain | null; readonly attempts: readonly Plain[]; readonly eventCounts: readonly Plain[]; readonly readTimes: readonly Plain[]
  }>
  readonly exportAttempts: (id: string) => Rows
  readonly freeSessionFor: (userId: string) => Promise<string>
}

export type SessionDeps = {
  readonly sessions: SessionRepository
  readonly cache: Cache
  readonly random: () => number
  readonly now: () => Date
}
