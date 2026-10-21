import { assertCanControl, type Cache, type Clock, type SessionRepository, type SessionRow } from '@earthcation/model'
import type { StartRoomCommand } from './StartRoomCommand'

export interface StartRoomDeps {
  readonly repo: SessionRepository
  readonly cache: Cache
  readonly clock: Clock
}

/** El instructor dueño inicia su sala (`PATCH /api/sessions/:id/start`); el Juego libre no se puede iniciar. */
export class StartRoomUseCase {
  constructor(private readonly deps: StartRoomDeps) {}

  async execute(cmd: StartRoomCommand): Promise<SessionRow> {
    const room = assertCanControl(await this.deps.repo.find(cmd.id), cmd.instructorId)
    await this.deps.cache.bump(`session:${room.id}`)
    return this.deps.repo.update(room.id, { status: 'active', started_at: this.deps.clock.now() })
  }
}
