import type { AuthenticatedUser } from '../AuthenticatedUser'

/** Puerto de salida: valida el token de sesión. Lanza InvalidTokenError si es inválido o venció. */
export interface TokenVerifier {
  verify(token: string): AuthenticatedUser
}
