import {
  User, UserNotFoundError,
  type IdentifierAvailability, type UserListingRow, type UserReadModel, type UserRepository,
} from '@earthcation/model'
import type { UpdateUserCommand } from './UpdateUserCommand'

export interface UpdateUserDeps {
  readonly users: UserRepository
  readonly availability: IdentifierAvailability
  readonly readModel: UserReadModel
}

const found = <T>(value: T | null): T => {
  if (value === null) throw new UserNotFoundError()
  return value
}

/** Cada quien edita sus datos personales; el admin, además, identificadores, rol y perfil de cualquiera. */
export class UpdateUserUseCase {
  constructor(private readonly deps: UpdateUserDeps) {}

  async execute(cmd: UpdateUserCommand): Promise<UserListingRow> {
    User.assertEditableBy(cmd.id, cmd.editor)
    const user = found(await this.deps.users.findById(cmd.id))
    const before = { username: user.username, cedula: user.cedula }
    user.edit(cmd.fields, cmd.editor)
    await this.deps.availability.ensureFree({ username: user.username, cedula: user.cedula }, before)
    await this.deps.users.save(user)
    return found(await this.deps.readModel.get(user.id))
  }
}
