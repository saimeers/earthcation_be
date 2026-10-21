import type { PlaceFilter, SessionRepository, SessionRow } from '@earthcation/model'

/** Salas de una localidad, para el panel de instructores/admin (`GET /api/sessions/by-location`). */
export class ListRoomsByLocationUseCase {
  constructor(private readonly repo: SessionRepository) {}

  execute(filter: PlaceFilter): Promise<readonly SessionRow[]> {
    return this.repo.byLocation(filter)
  }
}
