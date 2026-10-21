import type { Requester } from '@earthcation/model'

export interface ExportRoomReportQuery {
  readonly id: string
  readonly requester: Requester
}
