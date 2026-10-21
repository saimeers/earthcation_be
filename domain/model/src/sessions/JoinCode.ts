import { SessionCodeRequiredError } from './errors/SessionErrors'

type Fields = Readonly<Record<string, unknown>>

/** El código que manda el jugador al unirse (`POST /api/sessions/join`); se busca tal cual, sin validar formato. */
export const joinCodeOf = (body: Fields): unknown => {
  if (!body.code) throw new SessionCodeRequiredError()
  return body.code
}
