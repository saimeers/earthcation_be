import type { Request } from 'express'
import { z } from 'zod'
import { ROLES, type LoginOrigin, type UserFields } from '@earthcation/model'
import type { LoginResult } from '@earthcation/usecase'
import { camelize } from './camelize'
import { locationDto, organizationDto } from './catalog'
import { varkStyle } from './vark'

// Respuestas y cuerpos v1 de identidad: camelCase. La contraseña nunca se responde.

export const roleSchema = z.enum(ROLES)

export const accountDto = z.object({
  id: z.string(),
  username: z.string().nullable(),
  cedula: z.string().nullable(),
  email: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  role: roleSchema,
  varkCompleted: z.boolean().describe('true si el jugador ya hizo el test VARK'),
  dominantStyle: varkStyle.nullable(),
  organization: organizationDto.nullable(),
  location: locationDto.nullable(),
})

export const sessionDto = z.object({ token: z.string().describe('JWT para el encabezado Authorization: Bearer'), user: accountDto })

export const toSessionDto = ({ token, user, profile }: LoginResult): z.infer<typeof sessionDto> => ({
  token,
  user: {
    id: user.id, username: user.username, cedula: user.cedula, email: user.email, firstName: user.firstName, lastName: user.lastName,
    role: user.role, varkCompleted: profile.dominantStyle !== null, dominantStyle: profile.dominantStyle as z.infer<typeof varkStyle> | null,
    organization: camelize(profile.organization) as z.infer<typeof organizationDto> | null,
    location: camelize(profile.location) as z.infer<typeof locationDto> | null,
  },
})

export const loginOrigin = (req: Request): LoginOrigin => ({ ip: req.ip, headers: req.headers })

const profileDto = z.object({
  id: z.string(), userId: z.string(), organizationId: z.string().nullable(), locationId: z.string().nullable(),
  organization: organizationDto.nullable().optional(), location: locationDto.nullable().optional(),
})

export const userDto = z.object({
  id: z.string(),
  username: z.string().nullable(),
  cedula: z.string(),
  email: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  age: z.number().int().nullable(),
  role: roleSchema,
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  profile: profileDto.nullable().optional(),
  varkProfile: z.object({
    visualScore: z.number().int(), auditoryScore: z.number().int(), readingScore: z.number().int(), dominantStyle: varkStyle,
  }).nullable().optional(),
})

export const userSessionDto = z.object({
  id: z.string(),
  userId: z.string(),
  sessionId: z.string(),
  joinedAt: z.iso.datetime(),
  session: z.object({
    id: z.string(), code: z.string().nullable(), name: z.string().nullable(), status: z.string(),
    createdAt: z.iso.datetime(), startedAt: z.iso.datetime().nullable(), endedAt: z.iso.datetime().nullable(),
  }),
})

/** Campos que se pueden enviar al crear o editar un usuario; el dominio revisa las reglas (cédula, rol, correo…). */
export const userFields = z.object({
  cedula: z.string().min(1),
  username: z.string().min(1),
  email: z.email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  age: z.number().int().min(0),
  role: roleSchema,
  organizationId: z.uuid().nullable(),
  locationId: z.uuid().nullable(),
})

export type UserFieldsBody = Partial<z.infer<typeof userFields>>

/** Cuerpo v1 → campos del dominio (los mismos nombres, camelCase). */
export const toUserFields = (b: UserFieldsBody): UserFields => ({ ...b })

export const createdUserDto = z.object({
  id: z.string(),
  emailSent: z.boolean().describe('true si el correo con el enlace para definir la contraseña salió (solo personal)'),
  welcome: z.enum(['player', 'sent', 'failed']).describe('player: sin correo; sent: enviado; failed: la cuenta se creó pero el correo falló'),
})
