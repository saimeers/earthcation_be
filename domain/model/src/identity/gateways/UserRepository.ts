import type { NewUser, ResetToken, User } from '../User'

/** Lo que se guarda con la cuenta nueva y nunca sale en una respuesta. */
export interface UserSecrets {
  readonly passwordHash: string
  readonly resetToken: ResetToken | null
}

/** Puerto de salida: persistencia de cuentas (usuario + perfil de organización/localidad). */
export interface UserRepository {
  findById(id: string): Promise<User | null>
  findByCedula(cedula: string): Promise<User | null>
  /** El correo no es único: la primera cuenta con ese correo. */
  findByEmail(email: string): Promise<User | null>
  /** La cuenta con ese token de restablecimiento aún vigente en `now`. */
  findByResetToken(hash: string, now: Date): Promise<User | null>
  usernameExists(username: string): Promise<boolean>
  cedulaExists(cedula: string): Promise<boolean>
  /** Cuáles de estas cédulas ya están registradas (una sola consulta). */
  registeredCedulas(cedulas: readonly string[]): Promise<ReadonlySet<string>>
  /** Usuario y perfil en una transacción; devuelve el id. */
  create(user: NewUser, secrets: UserSecrets): Promise<string>
  /** Guarda la cuenta y, si tiene perfil, lo crea o actualiza. */
  save(user: User): Promise<void>
}
