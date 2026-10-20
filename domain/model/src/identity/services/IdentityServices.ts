import type { Clock } from '../../shared/gateways/Clock'
import { CedulaTakenError, UsernameTakenError } from '../errors/IdentityErrors'
import type { UserRepository } from '../gateways/UserRepository'
import type { ResetTokenService } from '../gateways/Security'
import type { ResetToken } from '../User'

export interface Identifiers {
  readonly username: string | null
  readonly cedula: string | null
}

/** Servicio de dominio: usuario y cédula no se repiten (al crear y al editar). */
export class IdentifierAvailability {
  constructor(private readonly users: UserRepository) {}

  /** Lanza si alguno de los nuevos ya es de otra cuenta; el valor actual de la propia cuenta no cuenta. */
  async ensureFree(next: Identifiers, current: Identifiers = { username: null, cedula: null }): Promise<void> {
    if (await this.taken(next.username, current.username, (u) => this.users.usernameExists(u))) throw new UsernameTakenError()
    if (await this.taken(next.cedula, current.cedula, (c) => this.users.cedulaExists(c))) throw new CedulaTakenError()
  }

  private async taken(next: string | null, current: string | null, exists: (v: string) => Promise<boolean>): Promise<boolean> {
    return next !== null && next !== current && (await exists(next))
  }
}

export const RESET_TTL_MS = 15 * 60 * 1000

export interface IssuedResetToken {
  /** Lo que viaja en el enlace del correo. */
  readonly raw: string
  /** Lo que se guarda con la cuenta. */
  readonly token: ResetToken
}

/** Servicio de dominio: token de restablecimiento con vigencia de 15 minutos (alta de staff y "olvidé mi contraseña"). */
export class ResetTokenFactory {
  constructor(private readonly tokens: ResetTokenService, private readonly clock: Clock) {}

  issue(): IssuedResetToken {
    const raw = this.tokens.generate()
    return { raw, token: { hash: this.tokens.hash(raw), expires: new Date(this.clock.now().getTime() + RESET_TTL_MS) } }
  }

  hashOf(raw: string): string { return this.tokens.hash(raw) }
}
