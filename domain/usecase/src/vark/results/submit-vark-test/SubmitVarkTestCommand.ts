export interface SubmitVarkTestCommand {
  readonly userId: string
  /** `{ q1: 'A', … }` tal como llega; el dominio lo valida. */
  readonly answers: unknown
}
