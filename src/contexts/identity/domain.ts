import { conflict, forbidden, notFound, unauthorized, validation, type DomainError } from '../../shared/errors'
import { err, ok, type Result } from '../../shared/result'

// Identidad: cuentas (jugadores entran solo con cédula; staff con contraseña), datos de usuario y
// restablecimiento de contraseña. Los campos editables de v1 viajan como bolsa snake_case hacia el modelo;
// el dominio decide cuáles pasan.

export type Fields = Readonly<Record<string, unknown>>

export const PLAYER = 'player'
export const ADMIN = 'admin'
export const needsPassword = (role: string): boolean => role !== PLAYER

export const RESET_TTL_MS = 15 * 60 * 1000

export const invalidCredentials = (): DomainError => unauthorized('INVALID_CREDENTIALS', 'Credenciales inválidas')
export const inactiveUser = (): DomainError => unauthorized('USER_INACTIVE', 'Usuario inactivo')
export const cedulaRequired = (): DomainError => validation('CEDULA_REQUIRED', 'La cédula es requerida')
export const emailRequired = (): DomainError => validation('EMAIL_REQUIRED', 'El email es requerido')
export const resetFieldsRequired = (): DomainError =>
  validation('RESET_FIELDS_REQUIRED', 'Token y nueva contraseña son requeridos')
export const invalidResetToken = (): DomainError => validation('RESET_TOKEN_INVALID', 'Token inválido o expirado')
export const userNotFound = (): DomainError => notFound('USER_NOT_FOUND', 'Usuario no encontrado')
export const cannotEditUser = (): DomainError => forbidden('USER_EDIT_FORBIDDEN', 'No tienes permiso para editar este usuario')
export const usernameTaken = (): DomainError => conflict('USERNAME_TAKEN', 'El nombre de usuario ya está en uso')
export const cedulaTaken = (): DomainError => conflict('CEDULA_TAKEN', 'La cédula ya está registrada')

/** Texto de un campo que llega del cliente: un número (cédula escrita como número) cuenta como texto. */
export const asText = (v: unknown): string | null =>
  typeof v === 'string' ? (v === '' ? null : v) : typeof v === 'number' ? String(v) : null

// Los formularios mandan '' en los campos opcionales vacíos — '' rompe la validación isEmail,
// el INTEGER de edad y los UUID de organización/localidad, así que se convierten a null.
const tidy = (v: unknown): unknown => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v)

export const pick = (data: Fields, keys: readonly string[]): Fields =>
  Object.fromEntries(keys.filter((k) => data[k] !== undefined).map((k) => [k, tidy(data[k])]))

// ── Alta por el admin ─────────────────────────────────────────────────────────

const CREATE_FIELDS = ['username', 'email', 'first_name', 'last_name', 'cedula', 'age', 'role', 'organization_id', 'location_id']

export type NewUser = {
  readonly username: string
  readonly cedula: string | null
  readonly email: string | null
  readonly role: string
  readonly firstName: string | null
  readonly details: Fields // first_name, last_name, age: van tal cual al modelo
  readonly profile: { readonly organization_id: unknown; readonly location_id: unknown }
}

const identifierRequired = (): DomainError =>
  validation('USER_IDENTIFIER_REQUIRED', 'La cédula o el nombre de usuario son requeridos')
const staffEmailRequired = (): DomainError =>
  validation('STAFF_EMAIL_REQUIRED', 'El correo es obligatorio para instructores y administradores')

const draftOf = (f: Fields, username: string): NewUser => ({
  username, cedula: asText(f.cedula), email: asText(f.email), role: asText(f.role) ?? PLAYER, firstName: asText(f.first_name),
  details: { first_name: f.first_name, last_name: f.last_name, age: f.age },
  profile: { organization_id: f.organization_id ?? null, location_id: f.location_id ?? null },
})

// Igual que la importación masiva: si no se da usuario, se usa la cédula (el jugador entra con ella).
// Admin/instructor entran al panel con contraseña — se la mandamos por correo, así que es obligatorio.
export const toNewUser = (data: Fields): Result<NewUser, DomainError> => {
  const f = pick(data, CREATE_FIELDS)
  const username = asText(f.username) ?? asText(f.cedula)
  if (username === null) return err(identifierRequired())
  const draft = draftOf(f, username)
  return needsPassword(draft.role) && draft.email === null ? err(staffEmailRequired()) : ok(draft)
}

// ── Edición ───────────────────────────────────────────────────────────────────

export type Requester = { readonly id: string; readonly role: string }

const ADMIN_FIELDS = ['first_name', 'last_name', 'age', 'cedula', 'email', 'username', 'role']
// Quien no es admin solo edita sus datos personales: rol, cédula, usuario, organización y localidad
// se ignoran (antes un jugador podía mandar {role:'admin'} y volverse administrador)
const SELF_FIELDS = ['first_name', 'last_name', 'age', 'email']
const PROFILE_FIELDS = ['organization_id', 'location_id']

export const canEdit = (targetId: string, r: Requester): boolean => r.id === targetId || r.role === ADMIN

export type UserPatch = { readonly user: Fields; readonly profile: Fields }

// username es NOT NULL: borrarlo desde el formulario no lo cambia
const withoutNullUsername = (f: Fields): Fields =>
  f.username === null ? Object.fromEntries(Object.entries(f).filter(([k]) => k !== 'username')) : f

export const toUserPatch = (data: Fields, r: Requester): UserPatch => {
  const isAdmin = r.role === ADMIN
  return {
    user: withoutNullUsername(pick(data, isAdmin ? ADMIN_FIELDS : SELF_FIELDS)),
    profile: isAdmin ? pick(data, PROFILE_FIELDS) : {},
  }
}

export type Identity = { readonly id: string; readonly username: string; readonly cedula: string | null }

// Un valor nuevo que choca con otro usuario (el propio valor actual no cuenta)
export const changed = (next: unknown, current: string | null): string | null => {
  const text = asText(next)
  return text !== null && text !== current ? text : null
}
