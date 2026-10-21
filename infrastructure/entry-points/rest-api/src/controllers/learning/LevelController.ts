import type { Request, Response } from 'express'
import type { GetLevelUseCase, ListLevelsUseCase } from '@earthcation/usecase'
import { pathParam } from '../../dto/v1/request'

export interface LevelUseCases {
  readonly list: ListLevelsUseCase
  readonly get: GetLevelUseCase
}

/** Traduce HTTP ↔ casos de uso de niveles (`/api/levels`). */
export class LevelController {
  constructor(private readonly useCases: LevelUseCases) {}

  list = async (_req: Request, res: Response): Promise<void> => {
    res.json(await this.useCases.list.execute())
  }

  get = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.useCases.get.execute(pathParam(req, 'id')))
  }
}
