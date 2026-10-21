import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { RoleNotAllowedError, TokenRequiredError, type AuthenticatedUser, type Role, type TokenVerifier } from '@earthcation/model'

declare module 'express-serve-static-core' {
  interface Request {
    /** Quién hace la petición (lo deja `authenticate`). */
    user?: AuthenticatedUser
  }
}

const bearer = (req: Request): string | undefined => req.headers.authorization?.split(' ')[1]

/**
 * Exige un token válido (`Authorization: Bearer …`) y deja al usuario en `req.user`. `onAuthenticated` avisa quién es
 * (la auditoría lo guarda en el ámbito de la petición).
 */
export const authenticate = (tokens: TokenVerifier, onAuthenticated?: (user: AuthenticatedUser) => void): RequestHandler => (req: Request, _res: Response, next: NextFunction) => {
  const token = bearer(req)
  if (!token) throw new TokenRequiredError()
  // eslint-disable-next-line no-param-reassign -- así pasa Express datos entre middlewares (req.user)
  req.user = tokens.verify(token)
  onAuthenticated?.(req.user)
  next()
}

/** Exige uno de los roles dados (después de `authenticate`). */
export const requireRole = (...roles: readonly Role[]): RequestHandler => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user || !roles.includes(req.user.role)) throw new RoleNotAllowedError()
  next()
}

/** El usuario autenticado; solo se usa en rutas detrás de `authenticate`. */
export const currentUser = (req: Request): AuthenticatedUser => {
  if (!req.user) throw new TokenRequiredError()
  return req.user
}
