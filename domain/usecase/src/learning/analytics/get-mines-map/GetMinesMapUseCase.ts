import type { AnalyticsReadModel, Cache, LearningRow } from '@earthcation/model'

export interface GetMinesMapDeps {
  readonly analytics: AnalyticsReadModel
  readonly cache: Cache
}

const TTL_SECONDS = 60

/** Unidades mineras con su ubicación y % de mitigación, para el mapa del panel (60 s en caché). */
export class GetMinesMapUseCase {
  constructor(private readonly deps: GetMinesMapDeps) {}

  execute(): Promise<readonly LearningRow[]> {
    const entry = { namespace: 'analytics', key: 'mines-map', ttlSeconds: TTL_SECONDS }
    return this.deps.cache.remember(entry, () => this.deps.analytics.minesMap())
  }
}
