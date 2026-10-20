export const ROLES = ['player', 'instructor', 'admin', 'developer'] as const
export type Role = (typeof ROLES)[number]

/** Quién hace la petición, tal como lo deja el token de sesión. `username` es la cédula (así firma el login). */
export interface AuthenticatedUser {
  readonly id: string
  readonly role: Role
  readonly username: string | null
}
