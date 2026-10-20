import {
  User, UserRole,
  type ErrorReporter, type IdentifierAvailability, type Mailer, type NewUser, type PasswordGenerator, type PasswordHasher,
  type ResetTokenFactory, type UserRepository,
} from '@earthcation/model'
import type { CreatedUser, CreateUserCommand, WelcomeNotice } from './CreateUserCommand'

export interface CreateUserDeps {
  readonly users: UserRepository
  readonly availability: IdentifierAvailability
  readonly passwords: PasswordHasher
  readonly generator: PasswordGenerator
  readonly resetTokens: ResetTokenFactory
  readonly mailer: Mailer
  readonly errors: ErrorReporter
}

/**
 * Alta por el panel. El admin nunca escribe la contraseña: se genera una aleatoria y, al staff, se le manda por correo
 * con un enlace para definir la suya.
 */
export class CreateUserUseCase {
  constructor(private readonly deps: CreateUserDeps) {}

  async execute(cmd: CreateUserCommand): Promise<CreatedUser> {
    const draft = User.register(cmd.fields)
    await this.deps.availability.ensureFree(draft)
    const temporaryPassword = this.deps.generator.generate()
    const reset = UserRole.needsPassword(draft.role) ? this.deps.resetTokens.issue() : null
    const passwordHash = await this.deps.passwords.hash(temporaryPassword)
    const userId = await this.deps.users.create(draft, { passwordHash, resetToken: reset?.token ?? null })
    const notice = reset ? await this.welcome(draft, temporaryPassword, reset.raw) : 'player'
    return { userId, notice }
  }

  // El usuario ya existe: si el correo falla no se responde 500 (el admin reintentaría y chocaría con "cédula ya registrada")
  private async welcome(draft: NewUser, temporaryPassword: string, resetToken: string): Promise<WelcomeNotice> {
    try {
      await this.deps.mailer.sendWelcome({ to: draft.email ?? '', name: draft.firstName ?? draft.username, temporaryPassword, resetToken })
      return 'sent'
    } catch (e) {
      this.deps.errors.report(`[EMAIL] No se pudo enviar el correo de bienvenida: ${e instanceof Error ? e.message : String(e)}`)
      return 'failed'
    }
  }
}
