export interface EndAttemptCommand {
  readonly userId: string
  readonly attemptId: string
  /** Cuerpo del juego (`outcome`, …) tal como llega. */
  readonly body: Readonly<Record<string, unknown>>
}
