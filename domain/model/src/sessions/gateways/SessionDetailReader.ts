import type { SessionDetail } from '../detail'

/**
 * Puerto de salida: el detalle completo de `/progress/admin` (participantes, riesgos, niveles), calculado con
 * `sessionDetail` y compartido (en caché 10 s) entre el detalle, el análisis por participante y el Excel.
 */
export interface SessionDetailReader {
  read(id: string): Promise<SessionDetail | null>
}
