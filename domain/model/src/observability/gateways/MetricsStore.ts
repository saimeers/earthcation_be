import type { Buckets } from '../Metrics'

/** Almacén de las cubetas por minuto de las métricas de cada ruta. */
export interface MetricsStore {
  /** Suma una petición a la cubeta del minuto actual (y suelta los minutos fuera de la ventana). */
  record(route: string, ms: number, failed: boolean): void
  buckets(): Buckets
}
