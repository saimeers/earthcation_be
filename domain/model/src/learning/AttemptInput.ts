import { AttemptRequiredError, EventsRequiredError, EventTypeRequiredError, LevelKeyRequiredError } from './errors/LearningErrors'

type Fields = Readonly<Record<string, unknown>>

const present = (v: unknown): boolean => Boolean(v)
const orNull = (v: unknown): unknown => (present(v) ? v : null)
// Las claves pueden llegar como número desde el juego
const asKey = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v))
// Campos opcionales que v1 guardaba con `valor ?? null`
const nullable = (o: Fields, keys: readonly string[]): Fields => Object.fromEntries(keys.map((k) => [k, o[k] ?? null]))

export interface NewAttemptValues {
  readonly varkStyle: unknown
  readonly gasBrand: unknown
  readonly gameVersion: string | null
}

/** Abrir un intento de nivel (`POST /api/telemetry/attempts`). */
export class NewAttemptInput {
  private constructor(readonly levelKey: string, readonly sessionId: unknown, readonly values: NewAttemptValues) {}

  static from(body: Fields): NewAttemptInput {
    if (!present(body.level_key)) throw new LevelKeyRequiredError()
    return new NewAttemptInput(asKey(body.level_key), orNull(body.session_id), {
      varkStyle: orNull(body.vark_style),
      gasBrand: orNull(body.gas_brand),
      gameVersion: typeof body.game_version === 'string' ? body.game_version.slice(0, 20) : null,
    })
  }
}

// 'level2' → número 2 (el nivel se busca por nombre "Nivel 2…": el id interno puede no coincidir)
export const levelNumber = (levelKey: string): string | null => levelKey.replace(/\D/g, '') || null

const ATTEMPT_FIELDS = ['outcome', 'fail_reason', 'fail_risk_id', 'fail_stage', 'duration_ms', 'final_health', 'device_calibrated', 'gas_brand', 'summary']

/** Lo que el juego puede cambiar al cerrar un intento (`PATCH /api/telemetry/attempts/:id`); un resultado final pone la hora de cierre. */
export const toAttemptPatch = (body: Fields, now: Date): Fields => {
  const patch = Object.fromEntries(ATTEMPT_FIELDS.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]))
  return present(patch.outcome) && patch.outcome !== 'in_progress' ? { ...patch, ended_at: now } : patch
}

const isEvent = (e: unknown): e is Fields => e !== null && typeof e === 'object' && present((e as Fields).event_type)

/** Lote de eventos de telemetría de un intento (`POST /api/telemetry/events`). */
export class EventBatch {
  private constructor(readonly attemptId: string, readonly events: readonly Fields[]) {}

  static from(body: Fields): EventBatch {
    if (!present(body.attempt_id)) throw new AttemptRequiredError()
    if (!Array.isArray(body.events) || body.events.length === 0) throw new EventsRequiredError()
    const events: readonly unknown[] = body.events
    if (!events.every(isEvent)) throw new EventTypeRequiredError()
    return new EventBatch(asKey(body.attempt_id), events)
  }

  /** Filas listas para `GameEvent` (una por evento, con el usuario y el intento). */
  rows(userId: string): readonly Fields[] {
    return this.events.map((e) => ({
      attempt_id: this.attemptId, user_id: userId, event_type: e.event_type, risk_id: orNull(e.risk_id), stage: orNull(e.stage),
      ...nullable(e, ['t_ms', 'pos_x', 'health', 'fatigue', 'payload']),
    }))
  }
}
