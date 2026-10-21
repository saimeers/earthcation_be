import { canSee, SessionForbiddenError, type SessionRepository, type SessionRow } from '@earthcation/model'
import type { GetRoomProgressQuery } from './GetRoomProgressQuery'
import { roomProgressRow } from './RoomProgressRow'

/**
 * Progreso simple de una sala para el instructor dueño (`GET /api/sessions/:id/progress`); a diferencia del
 * detalle completo, admin y desarrollador NO lo ven si no son los dueños (comportamiento de v1 conservado).
 */
export class GetRoomProgressUseCase {
  constructor(private readonly repo: SessionRepository) {}

  async execute(query: GetRoomProgressQuery): Promise<SessionRow> {
    if (!(await this.visible(query.id, query.instructorId))) throw new SessionForbiddenError()
    const data = await this.repo.withResults(query.id)
    if (data === null) throw new SessionForbiddenError()
    const list = Array.isArray(data.session.participants) ? (data.session.participants as SessionRow[]) : []
    return { session: data.session, participants: list.map(roomProgressRow(data.results)) }
  }

  private async visible(id: string, instructorId: string): Promise<boolean> {
    const room = await this.repo.find(id)
    return room !== null && canSee(room, instructorId, await this.repo.profileLocation(instructorId))
  }
}
