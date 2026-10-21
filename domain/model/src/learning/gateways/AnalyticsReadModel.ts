import type { LearningRow } from './LearningReadModel'

export type PlaceFilter = { readonly department?: string; readonly municipality?: string }

/** Puerto de salida: analítica del panel (resumen global, por organización, por localidad, mapa de minas). */
export interface AnalyticsReadModel {
  overview(): Promise<LearningRow>
  byOrganization(organizationId: string): Promise<readonly LearningRow[]>
  byLocation(filter: PlaceFilter): Promise<readonly LearningRow[]>
  minesMap(): Promise<readonly LearningRow[]>
}
