import { VisitWindow, type Cache, type Clock, type VisitStats, type VisitStatsReadModel } from '@earthcation/model'
import type { GetVisitStatsQuery } from './GetVisitStatsQuery'

export interface GetVisitStatsDeps {
  readonly stats: VisitStatsReadModel
  readonly cache: Cache
  readonly clock: Clock
}

const TTL_SECONDS = 60

/** Visitas e inicios de sesión de la ventana pedida, para la página Visitas del panel (en caché 60 s). */
export class GetVisitStatsUseCase {
  constructor(private readonly deps: GetVisitStatsDeps) {}

  execute(query: GetVisitStatsQuery): Promise<VisitStats> {
    const window = VisitWindow.of(query.days)
    // La clave de caché cambió con la forma del valor (camelCase): un valor viejo de v1 en Redis no se reusa
    const entry = { namespace: 'visit-stats', key: String(window.days), ttlSeconds: TTL_SECONDS }
    return this.deps.cache.remember(entry, () => this.compute(window))
  }

  private async compute(window: VisitWindow): Promise<VisitStats> {
    const since = window.since(this.deps.clock.now())
    return { days: window.days, since: since.toISOString(), ...(await this.deps.stats.aggregate(since)) }
  }
}
