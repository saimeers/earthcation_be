export interface ListAttemptsQuery {
  readonly userId: string
  readonly sessionId?: string
  readonly levelKey?: string
}
