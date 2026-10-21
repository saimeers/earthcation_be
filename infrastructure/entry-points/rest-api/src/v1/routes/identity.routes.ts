import { z } from 'zod'
import { listQuery, paginate, sortBy } from '../http/pagination'
import { accepted, created, noContent, ok, page } from '../http/reply'
import { route, userOf, type Route } from '../http/route'
import type { AuthUseCases } from '../../controllers/identity/AuthController'
import type { UserUseCases } from '../../controllers/identity/UserController'
import { camelize } from '../dto/camelize'
import {
  createdUserDto, loginOrigin, roleSchema, sessionDto, toSessionDto, toUserFields, userDto, userFields, userSessionDto,
} from '../dto/identity'

// Ver usuarios: personal; crear y habilitar o deshabilitar: admin; editar: cualquiera con sesión sobre sí mismo y el
// admin sobre cualquiera (lo decide el caso de uso)
const READERS = ['admin', 'instructor', 'developer'] as const
const ADMINS = ['admin'] as const

const USER_SORT = ['createdAt', 'firstName', 'lastName', 'cedula'] as const
const SESSION_SORT = ['joinedAt'] as const

const idParams = z.object({ id: z.uuid().describe('Id (UUID) del usuario') })
const activeBody = z.object({ isActive: z.boolean().describe('true lo habilita, false lo deshabilita (no se borra)') })
const usersQuery = listQuery.extend({
  role: roleSchema.optional(),
  organizationId: z.uuid().optional().describe('Solo jugadores con perfil en esta organización'),
  locationId: z.uuid().optional().describe('Solo jugadores con perfil en esta localidad'),
})
const loginBody = z.object({
  cedula: z.string().min(1),
  password: z.string().optional().describe('Obligatoria para personal (instructor, admin, desarrollador); los jugadores entran solo con la cédula'),
})
const resetRequestBody = z.object({ email: z.email() })
const newPasswordBody = z.object({ token: z.string().min(1).describe('Token del enlace enviado por correo'), newPassword: z.string().min(1) })
const createBody = userFields.partial().required({ cedula: true })
const editBody = userFields.partial()

type Row = Record<string, unknown>

const RESET_SENT = 'Si el correo está registrado recibirás un enlace en breve.'

const authRoutes = (uc: AuthUseCases): Route[] => [
  route({
    method: 'post', path: '/auth/login', tag: 'Autenticación', summary: 'Inicia sesión (juego y panel)',
    body: loginBody,
    response: { status: 200, description: 'El token y los datos de la cuenta', schema: sessionDto },
    handler: async ({ body, req }) => ok(toSessionDto(await uc.login.execute({ cedula: body.cedula, password: body.password, origin: loginOrigin(req) }))),
  }),
  route({
    method: 'post', path: '/auth/password-resets', tag: 'Autenticación', summary: 'Solicita el enlace para restablecer la contraseña',
    body: resetRequestBody,
    response: { status: 202, description: 'Siempre responde igual, exista o no el correo', schema: z.object({ message: z.string() }) },
    handler: async ({ body }) => {
      await uc.requestPasswordReset.execute({ email: body.email })
      return accepted({ message: RESET_SENT })
    },
  }),
  route({
    method: 'put', path: '/auth/password', tag: 'Autenticación', summary: 'Define la contraseña con el token del enlace',
    body: newPasswordBody,
    response: { status: 204, description: 'Contraseña actualizada' },
    handler: async ({ body }) => {
      await uc.resetPassword.execute({ token: body.token, password: body.newPassword })
      return noContent()
    },
  }),
]

const userRoutes = (uc: UserUseCases): Route[] => [
  route({
    method: 'get', path: '/users', tag: 'Usuarios', summary: 'Lista los usuarios', roles: READERS,
    query: usersQuery,
    response: { status: 200, description: 'Una página de usuarios, los más recientes primero', schema: z.array(userDto), paginated: true },
    handler: async ({ query }) => {
      const rows = (await uc.list.execute(query)).map(camelize) as Row[]
      const { items, meta } = paginate(query.sort ? sortBy(rows, query.sort, USER_SORT) : rows, query)
      return page(items, meta)
    },
  }),
  route({
    method: 'get', path: '/users/:id', tag: 'Usuarios', summary: 'Consulta un usuario con su perfil y su resultado VARK', roles: READERS,
    params: idParams,
    response: { status: 200, description: 'El usuario', schema: userDto },
    handler: async ({ params }) => ok(camelize(await uc.get.execute(params.id))),
  }),
  route({
    method: 'get', path: '/users/:id/sessions', tag: 'Usuarios', summary: 'Historial de salas a las que se unió', roles: READERS,
    params: idParams, query: listQuery,
    response: { status: 200, description: 'Una página de inscripciones, la más reciente primero', schema: z.array(userSessionDto), paginated: true },
    handler: async ({ params, query }) => {
      const rows = (await uc.sessions.execute(params.id)).map(camelize) as Row[]
      const { items, meta } = paginate(query.sort ? sortBy(rows, query.sort, SESSION_SORT) : rows, query)
      return page(items, meta)
    },
  }),
  route({
    method: 'post', path: '/users', tag: 'Usuarios', summary: 'Crea un usuario', roles: ADMINS,
    body: createBody,
    response: { status: 201, description: 'El usuario creado (cabecera Location). La contraseña la genera el servidor y llega por correo', schema: createdUserDto },
    handler: async ({ body }) => {
      const c = await uc.create.execute({ fields: toUserFields(body) })
      return created(`/api/v1/users/${c.userId}`, { id: c.userId, emailSent: c.notice === 'sent', welcome: c.notice })
    },
  }),
  route({
    method: 'patch', path: '/users/:id', tag: 'Usuarios', summary: 'Edita un usuario', roles: [],
    params: idParams, body: editBody,
    response: { status: 200, description: 'El usuario actualizado. Quien no es admin solo edita nombre, apellido, edad y correo propios', schema: userDto },
    handler: async ({ params, body, user }) => ok(camelize(await uc.update.execute({ id: params.id, editor: userOf({ user }), fields: toUserFields(body) }))),
  }),
  route({
    method: 'put', path: '/users/:id/active', tag: 'Usuarios', summary: 'Habilita o deshabilita un usuario', roles: ADMINS,
    params: idParams, body: activeBody,
    response: { status: 200, description: 'El usuario con su nuevo estado', schema: z.object({ id: z.string(), isActive: z.boolean() }) },
    handler: async ({ params, body }) => {
      await uc.changeStatus.execute({ id: params.id, active: body.isActive })
      return ok({ id: params.id, isActive: body.isActive })
    },
  }),
  route({
    method: 'post', path: '/users/:id/anonymization', tag: 'Usuarios', summary: 'Anonimiza una cuenta (derecho de supresión)', roles: ADMINS,
    params: idParams,
    response: { status: 204, description: 'Cuenta anonimizada: sin nombre, cédula, usuario, correo ni edad; deshabilitada y sin contraseña. Conserva su progreso. No se deshace' },
    handler: async ({ params, user }) => {
      await uc.anonymize.execute({ id: params.id, requester: userOf({ user }) })
      return noContent()
    },
  }),
]

/** Rutas de v1 de identidad: autenticación y usuarios. */
export const identityRoutesV1 = (deps: { readonly auth: AuthUseCases, readonly users: UserUseCases }): Route[] =>
  [...authRoutes(deps.auth), ...userRoutes(deps.users)]

