import type { VisitAggregates } from '../VisitStats'

/** Agregaciones (en la base de datos) de visitas e inicios de sesión desde `since`. */
export interface VisitStatsReadModel {
  aggregate(since: Date): Promise<VisitAggregates>
}
