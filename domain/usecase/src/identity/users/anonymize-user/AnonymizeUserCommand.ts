import type { AuthenticatedUser } from '@earthcation/model'

export interface AnonymizeUserCommand {
  readonly id: string
  /** Quien lo pide (un admin); no puede anonimizar su propia cuenta. */
  readonly requester: AuthenticatedUser
}
