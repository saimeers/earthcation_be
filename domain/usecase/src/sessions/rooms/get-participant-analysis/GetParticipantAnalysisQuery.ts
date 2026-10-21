import type { Requester } from '@earthcation/model'

export interface GetParticipantAnalysisQuery {
  readonly id: string
  readonly userId: string
  readonly requester: Requester
}
