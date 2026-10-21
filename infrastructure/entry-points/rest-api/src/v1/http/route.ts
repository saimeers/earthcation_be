import type { Request, RequestHandler, Router } from 'express'
import type { ZodType } from 'zod'
import { TokenRequiredError, type AuthenticatedUser, type Role } from '@earthcation/model'
import { requireRole } from '../../middlewares/auth'
import { send, type Reply } from './reply'
import { parseWith } from './validate'

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'

/** Lo que recibe el handler de una ruta: la solicitud ya validada y tipada. */
export interface RouteContext<P, Q, B> {
  /** La solicitud de Express, para lo que depende del origen (IP, cabeceras). */
  readonly req: Request
  readonly params: P
  readonly query: Q
  readonly body: B
  /** Presente en rutas con `roles`. */
  readonly user: AuthenticatedUser | undefined
}

/** Una ruta de v1 definida una sola vez: de aquí salen el router de Express y la documentación OpenAPI. */
export interface RouteSpec<P, Q, B> {
  readonly method: HttpMethod
  /** Ruta relativa a /api/v1, con parámetros de Express (`/locations/:id`). */
  readonly path: string
  readonly tag: string
  readonly summary: string
  /** Sin `roles` la ruta es pública; con `[]` basta estar autenticado. */
  readonly roles?: readonly Role[]
  readonly params?: ZodType<P>
  readonly query?: ZodType<Q>
  readonly body?: ZodType<B>
  /** Middlewares propios de la ruta (cuerpo binario, multipart, secreto de ingesta), después de los roles. */
  readonly middlewares?: readonly RequestHandler[]
  /** Cuerpo que no es JSON (un ZIP, un archivo multipart): solo para documentarlo. */
  readonly upload?: { readonly contentType: string, readonly description: string, readonly field?: string }
  readonly response: { readonly status: 200 | 201 | 202 | 204, readonly description: string, readonly schema?: ZodType, readonly paginated?: boolean, readonly contentType?: string }
  readonly handler: (ctx: RouteContext<P, Q, B>) => Promise<Reply>
}

/** Parte de una ruta que describe la documentación (sin el handler ni los tipos). */
export interface OperationDoc {
  readonly method: HttpMethod
  readonly path: string
  readonly tag: string
  readonly summary: string
  readonly roles?: readonly Role[]
  readonly params?: ZodType
  readonly query?: ZodType
  readonly body?: ZodType
  readonly upload?: RouteSpec<unknown, unknown, unknown>['upload']
  readonly response: RouteSpec<unknown, unknown, unknown>['response']
}

export interface Route {
  readonly doc: OperationDoc
  readonly mount: (router: Router, authenticate: RequestHandler) => void
}

/** El usuario de una ruta con `roles` (ya pasó por `authenticate`). */
export const userOf = (ctx: { readonly user: AuthenticatedUser | undefined }): AuthenticatedUser => {
  if (!ctx.user) throw new TokenRequiredError()
  return ctx.user
}

const guards = (roles: readonly Role[] | undefined, authenticate: RequestHandler): RequestHandler[] =>
  (roles ? [authenticate, ...(roles.length > 0 ? [requireRole(...roles)] : [])] : [])

const contextOf = <P, Q, B>(spec: RouteSpec<P, Q, B>, req: Request): RouteContext<P, Q, B> => ({
  params: parseWith(spec.params, req.params, 'params'),
  query: parseWith(spec.query, req.query, 'query'),
  // express.json deja el cuerpo sin definir si no vino
  body: parseWith(spec.body, req.body ?? {}, 'body'),
  user: req.user,
  req,
})

const handlerOf = <P, Q, B>(spec: RouteSpec<P, Q, B>): RequestHandler => async (req, res) => {
  send(res, await spec.handler(contextOf(spec, req)))
}

/** Define una ruta de v1. */
export const route = <P = undefined, Q = undefined, B = undefined>(spec: RouteSpec<P, Q, B>): Route => ({
  doc: spec,
  mount: (router, authenticate) => {
    router[spec.method](spec.path, ...guards(spec.roles, authenticate), ...(spec.middlewares ?? []), handlerOf(spec))
  },
})
