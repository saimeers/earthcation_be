import type { Request, Response } from 'express'
import type { GetHealthUseCase } from '@earthcation/usecase'
import { healthDetailsV1, publicHealthV1 } from '../../dto/v1/observability'

/** Salud del servicio: estado público mínimo y detalle para el panel. */
export class HealthController {
  constructor(private readonly health: GetHealthUseCase) {}

  // Degradado (la BD no responde) es 503, para que los monitores lo vean
  status = async (_req: Request, res: Response): Promise<void> => {
    const h = await this.health.execute({ withMetrics: false })
    res.status(h.status === 'ok' ? 200 : 503).json(publicHealthV1(h))
  }

  details = async (_req: Request, res: Response): Promise<void> => {
    res.json(healthDetailsV1(await this.health.execute({ withMetrics: true })))
  }
}
