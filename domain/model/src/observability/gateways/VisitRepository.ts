import type { Visit } from '../Visit'

/** Puerto de salida: guarda las visitas que reporta el Worker. */
export interface VisitRepository {
  save(visit: Visit): Promise<void>
}
