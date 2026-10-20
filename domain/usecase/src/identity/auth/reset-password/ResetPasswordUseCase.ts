import {
  InvalidResetTokenError, ResetFieldsRequiredError,
  type Clock, type PasswordHasher, type ResetTokenFactory, type UserRepository,
} from '@earthcation/model'
import type { ResetPasswordCommand } from './ResetPasswordCommand'

export interface ResetPasswordDeps {
  readonly users: UserRepository
  readonly resetTokens: ResetTokenFactory
  readonly passwords: PasswordHasher
  readonly clock: Clock
}

// Sin recortar: los espacios son parte de la contraseña
const exact = (v: unknown): string | null =>
  typeof v === 'string' ? (v === '' ? null : v) : typeof v === 'number' ? String(v) : null

/** Define la contraseña con el token del correo (bienvenida u "olvidé mi contraseña"); el token sirve una sola vez. */
export class ResetPasswordUseCase {
  constructor(private readonly deps: ResetPasswordDeps) {}

  async execute(cmd: ResetPasswordCommand): Promise<void> {
    const [raw, plain] = [exact(cmd.token), exact(cmd.password)]
    if (raw === null || plain === null) throw new ResetFieldsRequiredError()
    const user = await this.deps.users.findByResetToken(this.deps.resetTokens.hashOf(raw), this.deps.clock.now())
    if (!user) throw new InvalidResetTokenError()
    user.changePassword(await this.deps.passwords.hash(plain))
    await this.deps.users.save(user)
  }
}
