import type { AnalyticsReadModel, LearningRow, PlaceFilter } from '@earthcation/model'

/** Progreso de los jugadores de una localidad (`GET /api/analytics/location`). */
export class GetAnalyticsByLocationUseCase {
  constructor(private readonly analytics: AnalyticsReadModel) {}

  execute(filter: PlaceFilter): Promise<readonly LearningRow[]> {
    return this.analytics.byLocation(filter)
  }
}
