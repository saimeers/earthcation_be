import { joinCodeOf, SessionCodeInvalidError, SessionFinishedError, type SessionRepository } from '@earthcation/model'
import type { JoinRoomCommand } from './JoinRoomCommand'
import type { JoinRoomResult } from './JoinRoomResult'

/** Un jugador se une a una sala con su código (`POST /api/sessions/join`); unirse de nuevo no es error. */
export class JoinRoomUseCase {
  constructor(private readonly repo: SessionRepository) {}

  async execute(cmd: JoinRoomCommand): Promise<JoinRoomResult> {
    const code = joinCodeOf(cmd.body)
    const record = await this.repo.findByCode(code)
    if (record === null) throw new SessionCodeInvalidError()
    if (record.room.status === 'finished') throw new SessionFinishedError()
    if (await this.repo.isEnrolled(record.room.id, cmd.userId)) return { session: record.view, joined: false }
    await this.repo.enroll(record.room.id, cmd.userId)
    return { session: record.view, joined: true }
  }
}
