import type { AnalyticsReadModel, Cache, LearningRow } from '@earthcation/model'

export interface GetAnalyticsOverviewDeps {
  readonly analytics: AnalyticsReadModel
  readonly cache: Cache
}

const TTL_SECONDS = 60

/** Resumen global del panel: usuarios, sesiones, VARK, progreso por nivel, riesgos más fallados, tendencia (60 s en caché). */
export class GetAnalyticsOverviewUseCase {
  constructor(private readonly deps: GetAnalyticsOverviewDeps) {}

  execute(): Promise<LearningRow> {
    const entry = { namespace: 'analytics', key: 'overview', ttlSeconds: TTL_SECONDS }
    return this.deps.cache.remember(entry, () => this.deps.analytics.overview())
  }
}
