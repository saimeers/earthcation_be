import type { Request, Response } from 'express'
import type {
  GetMyVarkResultUseCase, ListVarkResultsByPlaceUseCase, ListVarkResultsByStyleUseCase, ListVarkResultsUseCase,
  SubmitVarkTestUseCase,
} from '@earthcation/usecase'
import { currentUser } from '../../middlewares/auth'
import { varkResultLegacy, varkSubmissionLegacy } from '../../dto/legacy/vark'
import { bodyOf, pathParam, queryText } from '../../dto/legacy/request'

export interface VarkUseCases {
  readonly submit: SubmitVarkTestUseCase
  readonly mine: GetMyVarkResultUseCase
  readonly list: ListVarkResultsUseCase
  readonly listByStyle: ListVarkResultsByStyleUseCase
  readonly listByPlace: ListVarkResultsByPlaceUseCase
}

/** Traduce HTTP ↔ casos de uso del test VARK (sin lógica: los errores los traduce el errorHandler). */
export class VarkController {
  constructor(private readonly useCases: VarkUseCases) {}

  submit = async (req: Request, res: Response): Promise<void> => {
    const submission = await this.useCases.submit.execute({ userId: currentUser(req).id, answers: bodyOf(req).answers })
    res.json(varkSubmissionLegacy(submission))
  }

  mine = async (req: Request, res: Response): Promise<void> => {
    res.json(varkResultLegacy(await this.useCases.mine.execute(currentUser(req).id)))
  }

  list = async (_req: Request, res: Response): Promise<void> => {
    res.json(await this.useCases.list.execute())
  }

  byStyle = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.useCases.listByStyle.execute(pathParam(req, 'style')))
  }

  byPlace = async (req: Request, res: Response): Promise<void> => {
    const query = { department: queryText(req, 'department'), municipality: queryText(req, 'municipality') }
    res.json(await this.useCases.listByPlace.execute(query))
  }
}
