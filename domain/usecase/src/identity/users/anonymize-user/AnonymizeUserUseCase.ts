import {
  UserAlreadyAnonymizedError, UserAnonymizationSelfError, UserNotFoundError,
  type PasswordGenerator, type PasswordHasher, type UserRepository,
} from '@earthcation/model'
import type { AnonymizeUserCommand } from './AnonymizeUserCommand'

export interface AnonymizeUserDeps {
  readonly users: UserRepository
  readonly passwords: PasswordHasher
  readonly generator: PasswordGenerator
}

/**
 * Anonimiza una cuenta a pedido de su titular (derecho de supresión, Ley 1581 de 2012). Conserva su progreso sin
 * identidad, deja la cuenta deshabilitada y sin contraseña utilizable. No se deshace.
 */
export class AnonymizeUserUseCase {
  constructor(private readonly deps: AnonymizeUserDeps) {}

  async execute(cmd: AnonymizeUserCommand): Promise<void> {
    if (cmd.id === cmd.requester.id) throw new UserAnonymizationSelfError()
    const user = await this.deps.users.findById(cmd.id)
    if (!user) throw new UserNotFoundError()
    if (user.isAnonymized) throw new UserAlreadyAnonymizedError()
    // Un secreto aleatorio que nadie conoce: la cuenta no vuelve a poder entrar ni por restablecimiento
    user.anonymize(await this.deps.passwords.hash(this.deps.generator.generate()))
    await this.deps.users.save(user)
  }
}
