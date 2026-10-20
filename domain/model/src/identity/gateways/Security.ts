import type { Role } from '../AuthenticatedUser'

/** Puerto de salida: hash lento de contraseñas (bcrypt). */
export interface PasswordHasher {
  hash(plain: string): Promise<string>
  matches(plain: string, hash: string): Promise<boolean>
}

/** Puerto de salida: contraseña temporal aleatoria (criptográficamente segura). */
export interface PasswordGenerator {
  generate(): string
}

/** Puerto de salida: token de restablecimiento; al usuario va el token y en la BD queda solo su hash. */
export interface ResetTokenService {
  generate(): string
  hash(raw: string): string
}

/** Lo que firma el token de sesión. `username` es la cédula (así lo leen el juego y el panel). */
export interface TokenClaims {
  readonly id: string
  readonly username: string | null
  readonly role: Role
}

/** Puerto de salida: firma el token de sesión. */
export interface TokenIssuer {
  issue(claims: TokenClaims): string
}
