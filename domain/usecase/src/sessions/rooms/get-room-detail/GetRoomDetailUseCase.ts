import { SessionNotFoundError, type SessionDetail, type SessionDetailReader, type SessionRepository } from '@earthcation/model'
import { assertCanView } from '../assertCanView'
import type { GetRoomDetailQuery } from './GetRoomDetailQuery'

export interface GetRoomDetailDeps {
  readonly repo: SessionRepository
  readonly detailReader: SessionDetailReader
}

/** El cómputo completo de `/progress/admin`: admin y desarrollador ven todo; el instructor, lo suyo (403 si no). */
export class GetRoomDetailUseCase {
  constructor(private readonly deps: GetRoomDetailDeps) {}

  async execute(query: GetRoomDetailQuery): Promise<SessionDetail> {
    await assertCanView(this.deps.repo, query.id, query.requester)
    const detail = await this.deps.detailReader.read(query.id)
    if (detail === null) throw new SessionNotFoundError()
    return detail
  }
}
