import type { Request, Response } from 'express'
import type { GetLevelProgressUseCase, ListProgressUseCase, SaveProgressUseCase } from '@earthcation/usecase'
import { currentUser } from '../../middlewares/auth'
import { fullProgressLegacy, savedProgressLegacy } from '../../dto/legacy/learning'
import { bodyOf, pathParam, queryText } from '../../dto/legacy/request'

export interface ProgressUseCases {
  readonly save: SaveProgressUseCase
  readonly list: ListProgressUseCase
  readonly levelProgress: GetLevelProgressUseCase
}

/** Traduce HTTP ↔ casos de uso de progreso (`/api/progress`). */
export class ProgressController {
  constructor(private readonly useCases: ProgressUseCases) {}

  save = async (req: Request, res: Response): Promise<void> => {
    const progress = await this.useCases.save.execute({ userId: currentUser(req).id, body: bodyOf(req) })
    res.status(201).json(savedProgressLegacy(progress))
  }

  full = async (req: Request, res: Response): Promise<void> => {
    const userId = currentUser(req).id
    res.json(fullProgressLegacy(userId, await this.useCases.list.execute({ userId })))
  }

  mine = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.useCases.list.execute({ userId: currentUser(req).id, sessionId: pathParam(req, 'id') }))
  }

  history = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.useCases.list.execute({ userId: pathParam(req, 'userId'), sessionId: queryText(req, 'session_id') }))
  }

  levelProgress = async (req: Request, res: Response): Promise<void> => {
    const query = { userId: currentUser(req).id, levelId: pathParam(req, 'levelId') }
    res.json(await this.useCases.levelProgress.execute(query))
  }
}
