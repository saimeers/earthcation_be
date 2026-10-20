import { Email, type Mailer, type ResetTokenFactory, type UserRepository } from '@earthcation/model'
import type { RequestPasswordResetCommand } from './RequestPasswordResetCommand'

export interface RequestPasswordResetDeps {
  readonly users: UserRepository
  readonly resetTokens: ResetTokenFactory
  readonly mailer: Mailer
}

/** "Olvidé mi contraseña": termina igual exista o no el correo (no revela qué cuentas existen). */
export class RequestPasswordResetUseCase {
  constructor(private readonly deps: RequestPasswordResetDeps) {}

  async execute(cmd: RequestPasswordResetCommand): Promise<void> {
    const email = Email.required(cmd.email)
    const user = await this.deps.users.findByEmail(email.value)
    if (!user) return
    const { raw, token } = this.deps.resetTokens.issue()
    user.startPasswordReset(token)
    await this.deps.users.save(user)
    await this.deps.mailer.sendPasswordReset({ to: email.value, name: user.displayName, resetToken: raw })
  }
}
