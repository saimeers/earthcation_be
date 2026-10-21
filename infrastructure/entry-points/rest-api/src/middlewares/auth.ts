import type { NextFunction, Request, RequestHandler, Response } from 'express'
import {
  AccountDisabledError, InvalidTokenError, RoleNotAllowedError, TokenRequiredError,
  type AccountDirectory, type AuthenticatedUser, type Role, type TokenVerifier,
} from '@earthcation/model'

declare module 'express-serve-static-core' {
  interface Request {
    /** Quién hace la petición (lo deja `authenticate`). */
    user?: AuthenticatedUser
  }
}

const bearer = (req: Request): string | undefined => req.headers.authorization?.split(' ')[1]

export interface AuthenticateOptions {
  /**
   * Estado vigente de la cuenta. Con él, un token no sobrevive a una cuenta deshabilitada o borrada y el rol sale de la
   * cuenta, no del token (si cambió desde que se firmó, manda el actual).
   */
  readonly accounts?: AccountDirectory
  /** Avisa quién es (la auditoría lo guarda en el ámbito de la petición). */
  readonly onAuthenticated?: (user: AuthenticatedUser) => void
}

const currentAccount = async (claims: AuthenticatedUser, accounts: AccountDirectory | undefined): Promise<AuthenticatedUser> => {
  if (!accounts) return claims
  const status = await accounts.find(claims.id)
  if (!status) throw new InvalidTokenError()
  if (!status.isActive) throw new AccountDisabledError()
  return { ...claims, role: status.role }
}

/** Exige un token válido (`Authorization: Bearer …`) de una cuenta vigente y deja al usuario en `req.user`. */
export const authenticate = (tokens: TokenVerifier, options: AuthenticateOptions = {}): RequestHandler => async (req: Request, _res: Response, next: NextFunction) => {
  const token = bearer(req)
  if (!token) throw new TokenRequiredError()
  const user = await currentAccount(tokens.verify(token), options.accounts)
  // eslint-disable-next-line no-param-reassign -- así pasa Express datos entre middlewares (req.user)
  req.user = user
  options.onAuthenticated?.(user)
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
