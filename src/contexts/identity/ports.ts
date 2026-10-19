import type { Sheet } from './anm'
import type { Fields, Identity, NewUser } from './domain'
import type { Place } from './places'

/** Cuenta con lo que necesita el login y la respuesta que recibe el juego o el panel. */
export type Account = {
  readonly id: string
  readonly username: string
  readonly cedula: string | null
  readonly role: string
  readonly isActive: boolean
  readonly passwordHash: string
  readonly firstName: string | null
  readonly lastName: string | null
  readonly email: string | null
  readonly dominantStyle: string | null // null si no ha hecho el test VARK
  readonly organization: Fields | null
  readonly location: Fields | null
}

export type ResetTarget = { readonly id: string; readonly email: string; readonly name: string }
export type ResetToken = { readonly hash: string; readonly expires: Date }
export type ImportedUser = { readonly cedula: string; readonly details: Fields; readonly passwordHash: string }
export type Profile = { readonly organization_id: unknown; readonly location_id: unknown }

export type AccountRepository = {
  readonly findForLogin: (cedula: string) => Promise<Account | null>
  readonly findByEmail: (email: string) => Promise<ResetTarget | null>
  readonly findByResetToken: (hash: string, now: Date) => Promise<string | null>
  readonly saveResetToken: (id: string, token: ResetToken) => Promise<void>
  // Guarda la contraseña nueva y anula el token de restablecimiento
  readonly savePassword: (id: string, hash: string) => Promise<void>
  readonly findIdentity: (id: string) => Promise<Identity | null>
  readonly usernameExists: (username: string) => Promise<boolean>
  readonly cedulaExists: (cedula: string) => Promise<boolean>
  readonly registeredCedulas: (cedulas: readonly string[]) => Promise<ReadonlySet<string>>
  // Usuario y perfil en una transacción
  readonly create: (user: NewUser, secrets: { readonly passwordHash: string; readonly reset: ResetToken | null }) => Promise<string>
  readonly createImported: (user: ImportedUser, profile: Profile) => Promise<string>
  readonly update: (id: string, patch: Fields) => Promise<void>
  readonly updateProfile: (id: string, patch: Fields) => Promise<void>
  readonly setActive: (id: string, active: boolean) => Promise<boolean>
}

export type UserFilter = { readonly role?: string; readonly organizationId?: string; readonly locationId?: string }

// Modelo de lectura que consume el panel por v1 (filas con perfil, organización, localidad y VARK);
// v2 tendrá su propia proyección camelCase
export type UserReadModel = {
  readonly list: (filter: UserFilter) => Promise<readonly Fields[]>
  readonly get: (id: string) => Promise<Fields | null>
  readonly sessions: (id: string) => Promise<readonly Fields[]>
}

// Organizaciones y localidades que la importación masiva encuentra (sin distinguir mayúsculas) o crea
export type ImportDirectory = {
  readonly organization: (name: string) => Promise<{ readonly id: string; readonly created: boolean }>
  readonly location: (place: Place) => Promise<{ readonly id: string; readonly created: boolean }>
}

export type Passwords = {
  readonly hash: (plain: string) => Promise<string>
  readonly matches: (plain: string, hash: string) => Promise<boolean>
  readonly generate: () => string
}

export type ResetTokens = { readonly generate: () => string; readonly hash: (raw: string) => string }

export type TokenIssuer = { readonly issue: (claims: { readonly id: string; readonly username: string | null; readonly role: string }) => string }

export type Mailer = {
  readonly welcome: (m: { readonly to: string; readonly username: string; readonly temporaryPassword: string; readonly resetToken: string }) => Promise<unknown>
  readonly passwordReset: (m: { readonly to: string; readonly username: string; readonly resetToken: string }) => Promise<unknown>
}

export type SpreadsheetReader = { readonly firstSheet: (file: Buffer) => Sheet }

export type IdentityDeps = {
  readonly accounts: AccountRepository
  readonly users: UserReadModel
  readonly directory: ImportDirectory
  readonly passwords: Passwords
  readonly resetTokens: ResetTokens
  readonly tokens: TokenIssuer
  readonly mailer: Mailer
  readonly spreadsheets: SpreadsheetReader
  readonly now: () => number
  readonly logError: (message: string) => void
}
