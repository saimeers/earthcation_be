import { UserNotFoundError, type User, type UserRepository } from '@earthcation/model'
import type { ChangeUserStatusCommand } from './ChangeUserStatusCommand'

/** Habilita o deshabilita una cuenta (nunca se borra: su progreso queda en el histórico). */
export class ChangeUserStatusUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(cmd: ChangeUserStatusCommand): Promise<User> {
    const user = await this.users.findById(cmd.id)
    if (!user) throw new UserNotFoundError()
    if (cmd.active) user.enable()
    else user.disable()
    await this.users.save(user)
    return user
  }
}
