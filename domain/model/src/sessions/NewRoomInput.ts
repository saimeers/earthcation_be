import { SessionLocationRequiredError, SessionNameRequiredError } from './errors/SessionErrors'

type Fields = Readonly<Record<string, unknown>>

const present = (v: unknown): boolean => Boolean(v)

/** Datos para abrir una sala (`POST /api/sessions`): nombre y localidad. */
export class NewRoomInput {
  private constructor(readonly name: unknown, readonly locationId: unknown) {}

  static from(body: Fields): NewRoomInput {
    if (!present(body.name)) throw new SessionNameRequiredError()
    if (!present(body.location_id)) throw new SessionLocationRequiredError()
    return new NewRoomInput(body.name, body.location_id)
  }
}
