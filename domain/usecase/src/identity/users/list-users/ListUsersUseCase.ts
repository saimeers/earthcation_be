import type { UserFilter, UserListingRow, UserReadModel } from '@earthcation/model'

/** Usuarios para el panel (con perfil y VARK), filtrables por rol, organización y localidad. */
export class ListUsersUseCase {
  constructor(private readonly readModel: UserReadModel) {}

  execute(query: UserFilter): Promise<UserListingRow[]> {
    return this.readModel.list(query)
  }
}
