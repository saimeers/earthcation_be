import { ROLES, type Role } from '../AuthenticatedUser'
import { InvalidRoleError } from '../errors/IdentityErrors'
import { formText } from './formText'

const isRole = (v: string): v is Role => (ROLES as readonly string[]).includes(v)

const PLAYER: Role = 'player'
const ADMIN: Role = 'admin'

/** Rol de una cuenta: decide si entra con contraseña (staff, por el panel) o solo con la cédula (jugador, por el juego). */
export const UserRole = {
  PLAYER,
  ADMIN,

  /** null si viene vacío; uno que no existe es InvalidRoleError. */
  from(v: unknown): Role | null {
    const text = formText(v)
    if (text === null) return null
    if (!isRole(text)) throw new InvalidRoleError()
    return text
  },

  needsPassword: (role: Role): boolean => role !== PLAYER,

  isAdmin: (role: Role): boolean => role === ADMIN,
} as const
