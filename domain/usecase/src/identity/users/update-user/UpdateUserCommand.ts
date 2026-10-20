import type { AuthenticatedUser, UserFields } from '@earthcation/model'

export interface UpdateUserCommand {
  readonly id: string
  readonly editor: AuthenticatedUser
  readonly fields: UserFields
}
