import type { UserListingRow, UserReadModel } from '@earthcation/model'

/** Salas a las que se ha inscrito un usuario (vacío si no existe), la más reciente primero. */
export class GetUserSessionsUseCase {
  constructor(private readonly readModel: UserReadModel) {}

  execute(id: string): Promise<UserListingRow[]> {
    return this.readModel.sessions(id)
  }
}
