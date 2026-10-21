import { assertCanControl, type Cache, type Clock, type SessionRepository, type SessionRow } from '@earthcation/model'
import type { EndRoomCommand } from './EndRoomCommand'

export interface EndRoomDeps {
  readonly repo: SessionRepository
  readonly cache: Cache
  readonly clock: Clock
}

/** El instructor dueño termina su sala (`PATCH /api/sessions/:id/end`); libera su código de 3 dígitos. */
export class EndRoomUseCase {
  constructor(private readonly deps: EndRoomDeps) {}

  async execute(cmd: EndRoomCommand): Promise<SessionRow> {
    const room = assertCanControl(await this.deps.repo.find(cmd.id), cmd.instructorId)
    await this.deps.cache.bump(`session:${room.id}`)
    return this.deps.repo.update(room.id, { status: 'finished', ended_at: this.deps.clock.now() })
  }
}
