import type { OrganizationChanges } from '@earthcation/model'

export interface UpdateOrganizationCommand {
  readonly id: string
  readonly changes: OrganizationChanges
}
