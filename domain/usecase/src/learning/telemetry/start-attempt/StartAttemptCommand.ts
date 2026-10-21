export interface StartAttemptCommand {
  readonly userId: string
  /** Cuerpo del juego (`level_key`, …) tal como llega; el dominio lo valida. */
  readonly body: Readonly<Record<string, unknown>>
}
