import { UserNotFoundError, type UserListingRow, type UserReadModel } from '@earthcation/model'

/** Detalle de un usuario para el panel. */
export class GetUserUseCase {
  constructor(private readonly readModel: UserReadModel) {}

  async execute(id: string): Promise<UserListingRow> {
    const user = await this.readModel.get(id)
    if (!user) throw new UserNotFoundError()
    return user
  }
}
