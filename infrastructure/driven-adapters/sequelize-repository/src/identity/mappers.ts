import { User, type NewUser, type Role, type UserSecrets } from '@earthcation/model'
import { rowOf } from '../catalog/mappers'

export { rowOf }

// Filas de users / user_profiles (snake_case) ↔ entidad del dominio
export interface ProfileRow { organization_id: string | null; location_id: string | null }

export interface UserRow {
  id: string
  username: string
  cedula: string | null
  email: string | null
  first_name: string | null
  last_name: string | null
  age: number | null
  role: Role
  is_active: boolean
  password_hash: string
  reset_token_hash: string | null
  reset_token_expires: Date | null
  profile?: ProfileRow | null
}

const resetTokenOf = (r: UserRow) =>
  r.reset_token_hash !== null && r.reset_token_expires !== null ? { hash: r.reset_token_hash, expires: r.reset_token_expires } : null

const placementOf = (p: ProfileRow | null | undefined) =>
  p ? { organizationId: p.organization_id, locationId: p.location_id } : null

export const toUser = (r: UserRow): User => User.restore({
  id: r.id, username: r.username, cedula: r.cedula, email: r.email, firstName: r.first_name, lastName: r.last_name, age: r.age,
  role: r.role, isActive: r.is_active, passwordHash: r.password_hash, resetToken: resetTokenOf(r), placement: placementOf(r.profile),
})

const resetColumns = (token: { hash: string; expires: Date } | null) =>
  ({ reset_token_hash: token?.hash ?? null, reset_token_expires: token?.expires ?? null })

export const userColumns = (u: User) => {
  const p = u.toProps()
  return {
    username: p.username, cedula: p.cedula, email: p.email, first_name: p.firstName, last_name: p.lastName, age: p.age,
    role: p.role, is_active: p.isActive, password_hash: p.passwordHash, ...resetColumns(p.resetToken),
  }
}

export const newUserColumns = (u: NewUser, secrets: UserSecrets) => ({
  username: u.username, cedula: u.cedula, email: u.email, first_name: u.firstName, last_name: u.lastName, age: u.age, role: u.role,
  password_hash: secrets.passwordHash, ...resetColumns(secrets.resetToken),
})

export const profileColumns = (p: { organizationId: string | null; locationId: string | null }): ProfileRow =>
  ({ organization_id: p.organizationId, location_id: p.locationId })
