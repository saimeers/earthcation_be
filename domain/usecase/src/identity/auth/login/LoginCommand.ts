import type { LoginOrigin } from '@earthcation/model'

export interface LoginCommand {
  readonly cedula: unknown
  /** Solo se exige al staff; el jugador entra con la cédula aunque la mande. */
  readonly password: unknown
  readonly origin: LoginOrigin
}
