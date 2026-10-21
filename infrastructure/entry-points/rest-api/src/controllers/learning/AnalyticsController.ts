import type { Request, Response } from 'express'
import type {
  GetAnalyticsByLocationUseCase, GetAnalyticsByOrganizationUseCase, GetAnalyticsOverviewUseCase, GetMinesMapUseCase,
} from '@earthcation/usecase'
import { pathParam, queryText } from '../../dto/legacy/request'

export interface AnalyticsUseCases {
  readonly overview: GetAnalyticsOverviewUseCase
  readonly byOrganization: GetAnalyticsByOrganizationUseCase
  readonly byLocation: GetAnalyticsByLocationUseCase
  readonly minesMap: GetMinesMapUseCase
}

/** Traduce HTTP ↔ casos de uso de analítica (`/api/analytics`). */
export class AnalyticsController {
  constructor(private readonly useCases: AnalyticsUseCases) {}

  overview = async (_req: Request, res: Response): Promise<void> => {
    res.json(await this.useCases.overview.execute())
  }

  byOrganization = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.useCases.byOrganization.execute(pathParam(req, 'orgId')))
  }

  byLocation = async (req: Request, res: Response): Promise<void> => {
    const filter = { department: queryText(req, 'department'), municipality: queryText(req, 'municipality') }
    res.json(await this.useCases.byLocation.execute(filter))
  }

  minesMap = async (_req: Request, res: Response): Promise<void> => {
    res.json(await this.useCases.minesMap.execute())
  }
}
