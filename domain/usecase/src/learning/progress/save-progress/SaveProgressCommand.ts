export interface SaveProgressCommand {
  readonly userId: string
  /** Cuerpo del juego (`risk_id`, …) tal como llega; el dominio lo valida. */
  readonly body: Readonly<Record<string, unknown>>
}
