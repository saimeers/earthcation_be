import type { Request, Response } from 'express'
import type {
  EndAttemptUseCase, GetAttemptDetailUseCase, GetTelemetryOverviewUseCase, GetUserSummaryUseCase, ListAttemptsUseCase,
  SaveEventsUseCase, StartAttemptUseCase,
} from '@earthcation/usecase'
import { currentUser } from '../../middlewares/auth'
import { endedAttemptV1, savedEventsV1, startedAttemptV1 } from '../../dto/v1/learning'
import { bodyOf, pathParam, queryText } from '../../dto/v1/request'

export interface TelemetryUseCases {
  readonly startAttempt: StartAttemptUseCase
  readonly endAttempt: EndAttemptUseCase
  readonly saveEvents: SaveEventsUseCase
  readonly listAttempts: ListAttemptsUseCase
  readonly attemptDetail: GetAttemptDetailUseCase
  readonly userSummary: GetUserSummaryUseCase
  readonly overview: GetTelemetryOverviewUseCase
}

const attemptFilter = (req: Request, userId: string) => ({ userId, levelKey: queryText(req, 'level_key'), sessionId: queryText(req, 'session_id') })

/** Traduce HTTP ↔ casos de uso de telemetría (`/api/telemetry`). */
export class TelemetryController {
  constructor(private readonly useCases: TelemetryUseCases) {}

  startAttempt = async (req: Request, res: Response): Promise<void> => {
    const attempt = await this.useCases.startAttempt.execute({ userId: currentUser(req).id, body: bodyOf(req) })
    res.status(201).json(startedAttemptV1(attempt))
  }

  endAttempt = async (req: Request, res: Response): Promise<void> => {
    const cmd = { userId: currentUser(req).id, attemptId: pathParam(req, 'id'), body: bodyOf(req) }
    res.json(endedAttemptV1(await this.useCases.endAttempt.execute(cmd)))
  }

  saveEvents = async (req: Request, res: Response): Promise<void> => {
    const saved = await this.useCases.saveEvents.execute({ userId: currentUser(req).id, body: bodyOf(req) })
    res.status(201).json(savedEventsV1(saved))
  }

  myAttempts = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.useCases.listAttempts.execute(attemptFilter(req, currentUser(req).id)))
  }

  userAttempts = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.useCases.listAttempts.execute(attemptFilter(req, pathParam(req, 'userId'))))
  }

  attemptDetail = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.useCases.attemptDetail.execute(pathParam(req, 'id')))
  }

  userSummary = async (req: Request, res: Response): Promise<void> => {
    const query = { userId: pathParam(req, 'userId'), sessionId: queryText(req, 'session_id') }
    res.json(await this.useCases.userSummary.execute(query))
  }

  overview = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.useCases.overview.execute({ sessionId: queryText(req, 'session_id') }))
  }
}
