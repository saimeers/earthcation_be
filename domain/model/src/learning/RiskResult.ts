import { RiskRequiredError } from './errors/LearningErrors'

type Fields = Readonly<Record<string, unknown>>

const present = (v: unknown): boolean => Boolean(v)
const orNull = (v: unknown): unknown => (present(v) ? v : null)

export interface RiskResultValues {
  readonly detail: unknown
  readonly isMitigated: unknown
  readonly mistakesCount: unknown
  readonly reactionTimeMs: unknown
}

interface RiskResultFields {
  readonly riskId: unknown
  readonly sessionId: unknown
  readonly attemptId: unknown
  readonly values: RiskResultValues
}

/** Resultado del jugador frente a un riesgo (`POST /api/progress/save`): mitigado o no, errores, reacción. */
export class RiskResultInput {
  readonly riskId: unknown
  readonly sessionId: unknown
  readonly attemptId: unknown
  readonly values: RiskResultValues

  private constructor(fields: RiskResultFields) {
    this.riskId = fields.riskId
    this.sessionId = fields.sessionId
    this.attemptId = fields.attemptId
    this.values = fields.values
  }

  static from(body: Fields): RiskResultInput {
    if (!present(body.risk_id)) throw new RiskRequiredError()
    return new RiskResultInput({
      riskId: body.risk_id, sessionId: orNull(body.session_id), attemptId: orNull(body.attempt_id), values: valuesOf(body),
    })
  }
}

const valuesOf = (body: Fields): RiskResultValues => ({
  detail: orNull(body.detail),
  isMitigated: body.is_mitigated ?? false,
  mistakesCount: body.mistakes_count ?? 0,
  reactionTimeMs: body.reaction_time_ms ?? null,
})
