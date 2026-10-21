import type { SessionRepository, SessionRow } from '@earthcation/model'

/** Las salas del instructor, más el Juego libre de su localidad (`GET /api/sessions/mine`). */
export class ListMyRoomsUseCase {
  constructor(private readonly repo: SessionRepository) {}

  async execute(instructorId: string): Promise<readonly SessionRow[]> {
    const locationId = await this.repo.profileLocation(instructorId)
    return this.repo.mine(instructorId, locationId)
  }
}
