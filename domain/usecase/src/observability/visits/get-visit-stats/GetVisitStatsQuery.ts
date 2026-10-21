export interface GetVisitStatsQuery {
  /** Ventana pedida por el panel (?days=7|30|90); cualquier otro valor es 30. */
  readonly days: unknown
}
