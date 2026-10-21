/**
 * Filas de lectura del panel/juego tal como las arma la consulta (joins incluidos): v1 las devuelve crudas, igual
 * que `VarkListingRow` en el contexto VARK.
 */
export type LearningRow = Readonly<Record<string, unknown>>

export type SessionFilter = { readonly sessionId?: string }
export type AttemptFilter = SessionFilter & { readonly levelKey?: string }

/** Puerto de salida: lecturas de progreso, niveles y telemetría para el juego y el panel. */
export interface LearningReadModel {
  levels(): Promise<readonly LearningRow[]>
  level(id: string): Promise<LearningRow | null>
  progress(userId: string, filter: SessionFilter): Promise<readonly LearningRow[]>
  levelProgress(userId: string, levelId: string): Promise<LearningRow>
  attempts(userId: string, filter: AttemptFilter): Promise<readonly LearningRow[]>
  attemptDetail(id: string): Promise<LearningRow | null>
  userSummary(userId: string, filter: SessionFilter): Promise<LearningRow>
  telemetryOverview(filter: SessionFilter): Promise<LearningRow>
}
