import type { Role } from '../AuthenticatedUser'

/** Estado vigente de una cuenta: lo que manda sobre lo que diga el token (el rol puede haber cambiado desde que se firmó). */
export interface AccountStatus {
  readonly isActive: boolean
  readonly role: Role
}

/** Puerto de salida: consulta el estado vigente de una cuenta para que un token no sobreviva a su deshabilitación. */
export interface AccountDirectory {
  /** null si la cuenta ya no existe. */
  find(userId: string): Promise<AccountStatus | null>
}
