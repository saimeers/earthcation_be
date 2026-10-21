import {
  participantAnalysis, participantIndex, SessionNotFoundError,
  type SessionDetailReader, type SessionRepository,
} from '@earthcation/model'
import { assertCanView } from '../assertCanView'
import type { GetParticipantAnalysisQuery } from './GetParticipantAnalysisQuery'

export interface GetParticipantAnalysisDeps {
  readonly repo: SessionRepository
  readonly detailReader: SessionDetailReader
}

/** Lo propio de un participante en su sesión + promedios del grupo (`GET /:id/participants/:userId/analysis`). */
export class GetParticipantAnalysisUseCase {
  constructor(private readonly deps: GetParticipantAnalysisDeps) {}

  async execute(query: GetParticipantAnalysisQuery): Promise<ReturnType<typeof participantAnalysis>> {
    await assertCanView(this.deps.repo, query.id, query.requester)
    const detail = await this.deps.detailReader.read(query.id)
    if (detail === null) throw new SessionNotFoundError()
    const index = participantIndex(detail, query.userId)
    const input = await this.deps.repo.analysisInput(query.id, query.userId)
    return participantAnalysis({ detail, userId: query.userId, ...input }, index)
  }
}
