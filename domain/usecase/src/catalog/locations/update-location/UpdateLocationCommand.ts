import type { LocationChanges } from '@earthcation/model'

export interface UpdateLocationCommand {
  readonly id: string
  readonly changes: LocationChanges
}
