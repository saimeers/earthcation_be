import {
  Cedula, InvalidCredentialsError,
  type LoginProfile, type LoginRecorder, type PasswordHasher, type TokenIssuer, type User, type UserReadModel, type UserRepository,
} from '@earthcation/model'
import type { LoginCommand } from './LoginCommand'

export interface LoginDeps {
  readonly users: UserRepository
  readonly profiles: UserReadModel
  readonly passwords: PasswordHasher
  readonly tokens: TokenIssuer
  readonly logins: LoginRecorder
}

export interface LoginResult {
  readonly token: string
  readonly user: User
  readonly profile: LoginProfile
}

/**
 * Inicio de sesión del juego y del panel por el mismo endpoint: la exigencia de contraseña depende del rol de la
 * cuenta encontrada, no de lo que mande el cliente. La contraseña se verifica ANTES de revelar que está inactiva.
 */
export class LoginUseCase {
  constructor(private readonly deps: LoginDeps) {}

  async execute(cmd: LoginCommand): Promise<LoginResult> {
    const cedula = Cedula.required(cmd.cedula)
    const user = await this.deps.users.findByCedula(cedula.value)
    if (!user || !(await this.passwordMatches(user, cmd.password))) throw new InvalidCredentialsError()
    user.assertCanLogIn()
    const token = this.deps.tokens.issue({ id: user.id, username: user.cedula, role: user.role })
    this.deps.logins.record({ userId: user.id, role: user.role, origin: cmd.origin })
    return { token, user, profile: await this.deps.profiles.loginProfile(user.id) }
  }

  private async passwordMatches(user: User, password: unknown): Promise<boolean> {
    if (!user.requiresPassword) return true
    return typeof password === 'string' && password !== '' && this.deps.passwords.matches(password, user.passwordHash)
  }
}
