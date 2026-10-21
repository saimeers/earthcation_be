import type { Request } from 'express'
import type { LoginOrigin, PreviewRow, UserFields } from '@earthcation/model'
import type { CreatedUser, ImportedEntry, ImportReport, ImportRowInput, LoginResult, WelcomeNotice } from '@earthcation/usecase'

// Respuestas y cuerpos v1 de identidad: la misma forma snake_case de siempre (el juego y el panel la consumen)

type Body = Readonly<Record<string, unknown>>

export const accountV1 = ({ user, profile }: LoginResult) => ({
  id: user.id, username: user.username, first_name: user.firstName, last_name: user.lastName, role: user.role, cedula: user.cedula,
  email: user.email, vark_completed: profile.dominantStyle !== null, dominant_style: profile.dominantStyle,
  organization: profile.organization, location: profile.location,
})

export const sessionV1 = (r: LoginResult) => ({ message: 'Login exitoso', token: r.token, user: accountV1(r) })

export const loginOrigin = (req: Request): LoginOrigin => ({ ip: req.ip, headers: req.headers })

const CREATED_MESSAGE: Readonly<Record<WelcomeNotice, string>> = {
  player: 'Usuario creado', sent: 'Usuario creado y correo enviado', failed: 'Usuario creado, pero no se pudo enviar el correo',
}

export const creationV1 = (c: CreatedUser) =>
  ({ message: CREATED_MESSAGE[c.notice], user_id: c.userId, email_sent: c.notice === 'sent' })

/** Campos del formulario de usuario (snake_case) → campos del dominio; los que no vienen quedan undefined. */
export const userFieldsV1 = (b: Body): UserFields => ({
  username: b.username, cedula: b.cedula, email: b.email, firstName: b.first_name, lastName: b.last_name, age: b.age,
  role: b.role, organizationId: b.organization_id, locationId: b.location_id,
})

export const previewV1 = (r: PreviewRow) => ({
  cedula: r.cedula, first_name: r.firstName, last_name: r.lastName, age: r.age, email: r.email, organization_name: r.organizationName,
  location_municipality: r.locationMunicipality, location_department: r.locationDepartment, status: r.status, message: r.message,
})

const objectOr = (v: unknown): Body => (v !== null && typeof v === 'object' ? (v as Body) : {})

const importRowV1 = (v: unknown): ImportRowInput => {
  const r = objectOr(v)
  return {
    cedula: r.cedula, firstName: r.first_name, lastName: r.last_name, age: r.age, email: r.email, organizationName: r.organization_name,
    locationMunicipality: r.location_municipality, locationDepartment: r.location_department,
  }
}

/** `rows` del cuerpo; si no es un arreglo, ninguna (el caso de uso responde que faltan). */
export const importRowsV1 = (rows: unknown): ImportRowInput[] => (Array.isArray(rows) ? rows.map(importRowV1) : [])

const createdV1 = (c: ImportedEntry) => ({
  cedula: c.cedula, user_id: c.userId, organization_created: c.organizationCreated,
  location_created: c.locationCreated, location_no_match: c.locationNoMatch,
})

export const reportV1 = (r: ImportReport) => ({ created: r.created.map(createdV1), skipped: r.skipped, errors: r.errors })
