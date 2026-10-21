import type { Request, Response } from 'express'
import type {
  CreateRoomUseCase, EndRoomUseCase, ExportRoomReportUseCase, GetParticipantAnalysisUseCase, GetRoomByCodeUseCase,
  GetRoomDetailUseCase, GetRoomProgressUseCase, JoinRoomUseCase, ListAllRoomsUseCase, ListMyRoomsUseCase,
  ListRoomsByLocationUseCase, StartRoomUseCase,
} from '@earthcation/usecase'
import type { Requester } from '@earthcation/model'
import { currentUser } from '../../middlewares/auth'
import { createdRoomV1, endedRoomV1, exportFilename, joinedRoomV1, startedRoomV1, XLSX_CONTENT_TYPE } from '../../dto/v1/sessions'
import { bodyOf, pathParam, queryText } from '../../dto/v1/request'

export interface SessionUseCases {
  readonly create: CreateRoomUseCase
  readonly join: JoinRoomUseCase
  readonly start: StartRoomUseCase
  readonly end: EndRoomUseCase
  readonly byCode: GetRoomByCodeUseCase
  readonly mine: ListMyRoomsUseCase
  readonly all: ListAllRoomsUseCase
  readonly byLocation: ListRoomsByLocationUseCase
  readonly progress: GetRoomProgressUseCase
  readonly detail: GetRoomDetailUseCase
  readonly analysis: GetParticipantAnalysisUseCase
  readonly exportReport: ExportRoomReportUseCase
}

const requesterOf = (req: Request): Requester => currentUser(req)

/** Traduce HTTP ↔ casos de uso de sesiones (`/api/sessions`; sin lógica: los errores los traduce el errorHandler). */
export class SessionController {
  constructor(private readonly useCases: SessionUseCases) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const session = await this.useCases.create.execute({ instructorId: requesterOf(req).id, body: bodyOf(req) })
    res.status(201).json(createdRoomV1(session))
  }

  join = async (req: Request, res: Response): Promise<void> => {
    const joined = await this.useCases.join.execute({ userId: requesterOf(req).id, body: bodyOf(req) })
    res.json(joinedRoomV1(joined))
  }

  start = async (req: Request, res: Response): Promise<void> => {
    const session = await this.useCases.start.execute({ id: pathParam(req, 'id'), instructorId: requesterOf(req).id })
    res.json(startedRoomV1(session))
  }

  end = async (req: Request, res: Response): Promise<void> => {
    const session = await this.useCases.end.execute({ id: pathParam(req, 'id'), instructorId: requesterOf(req).id })
    res.json(endedRoomV1(session))
  }

  byCode = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.useCases.byCode.execute(pathParam(req, 'code')))
  }

  mine = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.useCases.mine.execute(requesterOf(req).id))
  }

  all = async (_req: Request, res: Response): Promise<void> => {
    res.json(await this.useCases.all.execute())
  }

  byLocation = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.useCases.byLocation.execute({ department: queryText(req, 'department'), municipality: queryText(req, 'municipality') }))
  }

  progress = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.useCases.progress.execute({ id: pathParam(req, 'id'), instructorId: requesterOf(req).id }))
  }

  detail = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.useCases.detail.execute({ id: pathParam(req, 'id'), requester: requesterOf(req) }))
  }

  analysis = async (req: Request, res: Response): Promise<void> => {
    const query = { id: pathParam(req, 'id'), userId: pathParam(req, 'userId'), requester: requesterOf(req) }
    res.json(await this.useCases.analysis.execute(query))
  }

  exportReport = async (req: Request, res: Response): Promise<void> => {
    const report = await this.useCases.exportReport.execute({ id: pathParam(req, 'id'), requester: requesterOf(req) })
    res.setHeader('Content-Type', XLSX_CONTENT_TYPE)
    res.setHeader('Content-Disposition', `attachment; filename="${exportFilename(report)}"`)
    res.end(report.buffer)
  }
}
