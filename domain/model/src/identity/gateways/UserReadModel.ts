/**
 * Fila que v1 devuelve tal cual al panel (usuario con perfil, organización, localidad y VARK, sin secretos; o una
 * inscripción con su sala). v2 tendrá su propia proyección.
 */
export type UserListingRow = Readonly<Record<string, unknown>>

export interface UserFilter {
  readonly role?: string
  readonly organizationId?: string
  readonly locationId?: string
}

/** Lo que el juego y el panel reciben de la cuenta al iniciar sesión, además de sus datos. */
export interface LoginProfile {
  /** null si no ha hecho el test VARK. */
  readonly dominantStyle: string | null
  readonly organization: UserListingRow | null
  readonly location: UserListingRow | null
}

/** Puerto de salida: lecturas de usuarios para el panel. */
export interface UserReadModel {
  /** Más recientes primero; con filtro de organización o localidad solo salen usuarios con perfil. */
  list(filter: UserFilter): Promise<UserListingRow[]>
  get(id: string): Promise<UserListingRow | null>
  /** Historial de inscripciones a salas, la más reciente primero. */
  sessions(id: string): Promise<UserListingRow[]>
  loginProfile(id: string): Promise<LoginProfile>
}
