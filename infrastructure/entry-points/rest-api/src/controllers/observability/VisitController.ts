import type { Request, Response } from 'express'
import type { GetVisitStatsUseCase, IngestVisitUseCase } from '@earthcation/usecase'
import { visitStatsLegacy } from '../../dto/legacy/observability'
import { bodyOf } from '../../dto/legacy/request'

export interface VisitUseCases {
  readonly ingest: IngestVisitUseCase
  readonly stats: GetVisitStatsUseCase
}

/** Traduce HTTP ↔ casos de uso de visitas (el secreto de ingesta lo revisa un middleware antes). */
export class VisitController {
  constructor(private readonly useCases: VisitUseCases) {}

  ingest = async (req: Request, res: Response): Promise<void> => {
    await this.useCases.ingest.execute({ fields: bodyOf(req) })
    res.status(204).end()
  }

  stats = async (req: Request, res: Response): Promise<void> => {
    res.json(visitStatsLegacy(await this.useCases.stats.execute({ days: req.query.days })))
  }
}
