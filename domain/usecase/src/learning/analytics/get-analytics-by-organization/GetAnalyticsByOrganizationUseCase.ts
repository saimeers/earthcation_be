import type { AnalyticsReadModel, LearningRow } from '@earthcation/model'

/** Progreso de los jugadores de una organización (`GET /api/analytics/organization/:orgId`). */
export class GetAnalyticsByOrganizationUseCase {
  constructor(private readonly analytics: AnalyticsReadModel) {}

  execute(organizationId: string): Promise<readonly LearningRow[]> {
    return this.analytics.byOrganization(organizationId)
  }
}
