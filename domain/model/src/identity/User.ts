import type { AuthenticatedUser, Role } from './AuthenticatedUser'
import {
  InvalidAgeError, StaffEmailRequiredError, UserEditForbiddenError, UserIdentifierRequiredError, UserInactiveError,
} from './errors/IdentityErrors'
import { Cedula } from './value-objects/Cedula'
import { Email } from './value-objects/Email'
import { formText } from './value-objects/formText'
import { UserRole } from './value-objects/UserRole'

/** Organización y localidad del perfil (tabla aparte: un usuario puede no tener perfil). */
export interface Placement {
  readonly organizationId: string | null
  readonly locationId: string | null
}

/** Token de restablecimiento de contraseña: solo se guarda su hash. */
export interface ResetToken {
  readonly hash: string
  readonly expires: Date
}

export interface UserProps {
  readonly id: string
  username: string
  cedula: string | null
  email: string | null
  firstName: string | null
  lastName: string | null
  age: number | null
  role: Role
  isActive: boolean
  passwordHash: string
  resetToken: ResetToken | null
  /** null: el usuario no tiene fila de perfil. */
  placement: Placement | null
}

/** Datos validados de una cuenta nueva (el id y la contraseña los pone quien la crea). */
export interface NewUser {
  readonly username: string
  readonly cedula: string | null
  readonly email: string | null
  readonly firstName: string | null
  readonly lastName: string | null
  readonly age: number | null
  readonly role: Role
  readonly placement: Placement
}

/** Campos como llegan del formulario; undefined = no vino (no cambia). */
export interface UserFields {
  readonly username?: unknown
  readonly cedula?: unknown
  readonly email?: unknown
  readonly firstName?: unknown
  readonly lastName?: unknown
  readonly age?: unknown
  readonly role?: unknown
  readonly organizationId?: unknown
  readonly locationId?: unknown
}

/** Una persona de la planilla ANM ya revisada en la vista previa. */
export interface ImportedPerson {
  readonly firstName: unknown
  readonly lastName?: unknown
  readonly age?: unknown
  readonly email?: unknown
}

// '' → null; un texto que no es número no llega a la columna INTEGER (Postgres redondea los decimales)
const ageOf = (v: unknown): number | null => {
  const text = formText(v)
  if (text === null) return null
  const age = Number(text)
  if (!Number.isFinite(age)) throw new InvalidAgeError()
  return Math.round(age)
}

const emailOf = (v: unknown): string | null => Email.from(v)?.value ?? null
const cedulaOf = (v: unknown): string | null => Cedula.from(v)?.value ?? null

type Editable = 'firstName' | 'lastName' | 'age' | 'email' | 'cedula' | 'username' | 'role'

const CHANGE: { readonly [K in Editable]: (v: unknown, current: UserProps) => UserProps[K] } = {
  firstName: formText,
  lastName: formText,
  age: ageOf,
  email: emailOf,
  cedula: cedulaOf,
  // username es NOT NULL y el rol no puede quedar vacío: borrarlos desde el formulario no los cambia
  username: (v, current) => formText(v) ?? current.username,
  role: (v, current) => UserRole.from(v) ?? current.role,
}

// Quien no es admin solo edita sus datos personales: rol, cédula, usuario, organización y localidad se ignoran
// (antes un jugador podía mandar {role:'admin'} y volverse administrador)
const SELF_FIELDS: readonly Editable[] = ['firstName', 'lastName', 'age', 'email']
const ADMIN_FIELDS: readonly Editable[] = [...SELF_FIELDS, 'cedula', 'username', 'role']

const sentOr = <T>(sent: unknown, next: T, current: T): T => (sent === undefined ? current : next)

const placementOf = (fields: UserFields): Placement =>
  ({ organizationId: formText(fields.organizationId), locationId: formText(fields.locationId) })

const draftOf = (fields: UserFields, username: string): NewUser => ({
  username, cedula: cedulaOf(fields.cedula), email: emailOf(fields.email), role: UserRole.from(fields.role) ?? UserRole.PLAYER,
  firstName: formText(fields.firstName), lastName: formText(fields.lastName), age: ageOf(fields.age), placement: placementOf(fields),
})

const ANONYMIZED_PREFIX = 'anon-'
const ANONYMIZED_ID_CHARS = 8

/**
 * Cuenta de la plataforma. Los jugadores entran al juego solo con la cédula; el staff entra al panel con contraseña.
 * Nunca se borra: se deshabilita para conservar su progreso histórico.
 */
export class User {
  private constructor(private readonly props: UserProps) {}

  static restore(props: UserProps): User {
    return new User({ ...props })
  }

  /**
   * Alta por el panel. Igual que la importación masiva: sin usuario se usa la cédula (el jugador entra con ella).
   * Admin/instructor entran al panel con contraseña y se la mandamos por correo, así que el correo es obligatorio.
   */
  static register(fields: UserFields): NewUser {
    const username = formText(fields.username) ?? cedulaOf(fields.cedula)
    if (username === null) throw new UserIdentifierRequiredError()
    const draft = draftOf(fields, username)
    if (UserRole.needsPassword(draft.role) && draft.email === null) throw new StaffEmailRequiredError()
    return draft
  }

  /** Alta desde la planilla ANM: siempre jugador, con usuario = cédula. */
  static imported(cedula: Cedula, person: ImportedPerson, placement: Placement): NewUser {
    return {
      username: cedula.value, cedula: cedula.value, role: UserRole.PLAYER, placement,
      firstName: formText(person.firstName), lastName: formText(person.lastName) ?? '', age: ageOf(person.age), email: emailOf(person.email),
    }
  }

  /** Cada quien edita su propia cuenta; el admin, cualquiera. */
  static assertEditableBy(userId: string, editor: AuthenticatedUser): void {
    if (editor.id !== userId && !UserRole.isAdmin(editor.role)) throw new UserEditForbiddenError()
  }

  get id(): string { return this.props.id }
  get username(): string { return this.props.username }
  get cedula(): string | null { return this.props.cedula }
  get email(): string | null { return this.props.email }
  get firstName(): string | null { return this.props.firstName }
  get lastName(): string | null { return this.props.lastName }
  get role(): Role { return this.props.role }
  get isActive(): boolean { return this.props.isActive }
  get passwordHash(): string { return this.props.passwordHash }

  /** Cómo se saluda en los correos. */
  get displayName(): string { return this.props.firstName ?? this.props.username }

  /** El juego (jugadores) entra solo con cédula; el panel (staff) exige contraseña. */
  get requiresPassword(): boolean { return UserRole.needsPassword(this.props.role) }

  assertCanLogIn(): void {
    if (!this.props.isActive) throw new UserInactiveError()
  }

  /** Aplica los campos que el editor puede cambiar; los demás se ignoran sin error. */
  edit(fields: UserFields, editor: AuthenticatedUser): void {
    const admin = UserRole.isAdmin(editor.role)
    for (const field of admin ? ADMIN_FIELDS : SELF_FIELDS) this.apply(field, fields[field])
    if (admin) this.place(fields)
  }

  startPasswordReset(token: ResetToken): void { this.props.resetToken = token }

  /** La contraseña nueva anula el token de restablecimiento (no se puede volver a usar). */
  changePassword(hash: string): void {
    this.props.passwordHash = hash
    this.props.resetToken = null
  }

  disable(): void { this.props.isActive = false }
  enable(): void { this.props.isActive = true }

  /** Una cuenta anonimizada ya no identifica a nadie: su cédula y su usuario son un alias `anon-…`. */
  get isAnonymized(): boolean { return this.props.username.startsWith(ANONYMIZED_PREFIX) }

  /**
   * Derecho de supresión (Ley 1581 de 2012): quita lo que identifica a la persona (nombre, cédula, usuario, correo, edad) y
   * deja la cuenta deshabilitada y sin contraseña utilizable. El progreso queda, desvinculado de cualquier identidad.
   * No se deshace. `unusablePasswordHash` es el hash de un secreto aleatorio que nadie conoce.
   */
  anonymize(unusablePasswordHash: string): void {
    const alias = `${ANONYMIZED_PREFIX}${this.props.id.slice(0, ANONYMIZED_ID_CHARS)}`
    Object.assign(this.props, {
      firstName: 'Anonimizado', lastName: null, age: null, email: null, cedula: alias, username: alias,
      isActive: false, passwordHash: unusablePasswordHash, resetToken: null,
    })
  }

  toProps(): Readonly<UserProps> { return { ...this.props } }

  // K hace que TypeScript relacione el campo con el tipo de su valor (con la unión Editable no compila)
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  private apply<K extends Editable>(field: K, value: unknown): void {
    if (value !== undefined) this.props[field] = CHANGE[field](value, this.props)
  }

  // Si no tenía perfil, se crea con lo que venga
  private place(fields: UserFields): void {
    if (fields.organizationId === undefined && fields.locationId === undefined) return
    const next = placementOf(fields)
    const current = this.props.placement ?? { organizationId: null, locationId: null }
    this.props.placement = {
      organizationId: sentOr(fields.organizationId, next.organizationId, current.organizationId),
      locationId: sentOr(fields.locationId, next.locationId, current.locationId),
    }
  }
}
