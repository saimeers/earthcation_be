import type { UserFields } from '@earthcation/model'

export interface CreateUserCommand {
  readonly fields: UserFields
}

/** Cómo terminó el aviso: a los jugadores nunca se les manda correo (entran solo con la cédula). */
export type WelcomeNotice = 'player' | 'sent' | 'failed'

export interface CreatedUser {
  readonly userId: string
  readonly notice: WelcomeNotice
}
