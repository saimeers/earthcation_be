export interface GetHealthQuery {
  /** El detalle del panel agrega las métricas de las últimas 15 min; el estado público no. */
  readonly withMetrics: boolean
}
