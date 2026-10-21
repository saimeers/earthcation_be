export interface SaveEventsCommand {
  readonly userId: string
  /** Cuerpo del juego (`attempt_id`, `events`, …) tal como llega; el dominio lo valida. */
  readonly body: Readonly<Record<string, unknown>>
}
