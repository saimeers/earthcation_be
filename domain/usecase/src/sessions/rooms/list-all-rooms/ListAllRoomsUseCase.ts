import type { SessionRepository, SessionRow } from '@earthcation/model'

/** Todas las salas, para admin y desarrollador (`GET /api/sessions/all`). */
export class ListAllRoomsUseCase {
  constructor(private readonly repo: SessionRepository) {}

  execute(): Promise<readonly SessionRow[]> {
    return this.repo.all()
  }
}
