import jwt, { type JwtPayload } from 'jsonwebtoken'
import {
  InvalidTokenError, ROLES,
  type AuthenticatedUser, type Role, type TokenClaims, type TokenIssuer, type TokenVerifier,
} from '@earthcation/model'

// Algoritmo fijo al firmar y al verificar: así no se acepta un token firmado con otro (p. ej. "none")
const ALGORITHM = 'HS256'
const EXPIRES_IN = '7d'

const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v)

const toAuthenticatedUser = (claims: JwtPayload): AuthenticatedUser => {
  const { id, role, username } = claims as { id?: unknown; role?: unknown; username?: unknown }
  if (typeof id !== 'string' || !isRole(role)) throw new InvalidTokenError()
  return { id, role, username: typeof username === 'string' ? username : null }
}

/** Tokens de sesión JWT (HS256, 7 días). El secreto llega validado desde la configuración. */
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
    return jwt.sign(payload, this.secret, { expiresIn: EXPIRES_IN, algorithm: ALGORITHM })
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
