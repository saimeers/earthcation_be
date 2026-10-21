import { assertRoomCodeFormat, SessionCodeNotLiveError, type SessionRepository, type SessionRow } from '@earthcation/model'

/** El código que llegó por QR muestra la sala sin inscribir (`GET /api/sessions/code/:code`). */
export class GetRoomByCodeUseCase {
  constructor(private readonly repo: SessionRepository) {}

  async execute(code: string): Promise<SessionRow> {
    const row = await this.repo.liveByCode(assertRoomCodeFormat(code))
    if (row === null) throw new SessionCodeNotLiveError()
    return row
  }
}
