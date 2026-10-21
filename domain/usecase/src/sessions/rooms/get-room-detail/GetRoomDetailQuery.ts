import type { Requester } from '@earthcation/model'

export interface GetRoomDetailQuery {
  readonly id: string
  readonly requester: Requester
}
