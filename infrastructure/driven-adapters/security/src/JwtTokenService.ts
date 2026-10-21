import jwt, { type JwtPayload } from 'jsonwebtoken'
import {
  InvalidTokenError, ROLES,
  type AuthenticatedUser, type Role, type TokenClaims, type TokenIssuer, type TokenVerifier,
} from '@earthcation/model'

// Algoritmo fijo al firmar y al verificar: así no se acepta un token firmado con otro (p. ej. "none")
const ALGORITHM = 'HS256'
// El personal (puede ver y cambiar datos de otros) tiene sesiones cortas; el jugador, una semana: entra desde el juego en
// una clase y no tiene dónde volver a escribir una contraseña a mitad de una sesión.
const STAFF_EXPIRES_IN = '24h'
const PLAYER_EXPIRES_IN = '7d'

const expiresFor = (role: unknown): string => (role === undefined || role === 'player' ? PLAYER_EXPIRES_IN : STAFF_EXPIRES_IN)

const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v)

const toAuthenticatedUser = (claims: JwtPayload): AuthenticatedUser => {
  const { id, role, username } = claims as { id?: unknown; role?: unknown; username?: unknown }
  if (typeof id !== 'string' || !isRole(role)) throw new InvalidTokenError()
  return { id, role, username: typeof username === 'string' ? username : null }
}

/** Tokens de sesión JWT (HS256; 24 horas el personal y 7 días el jugador). El secreto llega validado desde la configuración. */
export class JwtTokenService implements TokenIssuer, TokenVerifier {
  constructor(private readonly secret: string) {}

  issue(claims: TokenClaims): string {
    return this.sign({ id: claims.id, username: claims.username, role: claims.role })
  }

  verify(token: string): AuthenticatedUser {
    return toAuthenticatedUser(this.decode(token))
  }

  /** Firma un payload arbitrario (el código v1 y las pruebas firman su propio payload). */
  sign(payload: object): string {
    const { role } = payload as { role?: unknown }
    return jwt.sign(payload, this.secret, { expiresIn: expiresFor(role), algorithm: ALGORITHM } as jwt.SignOptions)
  }

  /** Payload completo de un token válido; InvalidTokenError si es inválido o venció. */
  decode(token: string): JwtPayload {
    try {
      const payload = jwt.verify(token, this.secret, { algorithms: [ALGORITHM] })
      if (typeof payload === 'string') throw new InvalidTokenError()
      return payload
    } catch {
      throw new InvalidTokenError()
    }
  }
}
