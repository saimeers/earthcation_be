import type { SessionRow } from '@earthcation/model'

export interface JoinRoomResult {
  readonly session: SessionRow
  readonly joined: boolean
}
