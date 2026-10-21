import type { RequestHandler } from 'express'
import { maskPersonalData } from '@earthcation/model'

/**
 * Enmascara los datos personales (cédula, usuario, correo, nombres y edad) en todas las respuestas JSON de los roles
 * indicados: el soporte técnico necesita diagnosticar, no identificar a las personas. Va antes de las rutas; el rol sale
 * de `req.user`, que `authenticate` deja más adelante, así que se mira al responder y no al llegar.
 */
export const maskForRoles = (roles: readonly string[]): RequestHandler => (req, res, next) => {
  const json = res.json.bind(res) as (body?: unknown) => typeof res
  // eslint-disable-next-line no-param-reassign -- así se intercepta la respuesta en Express
  res.json = (body?: unknown) => json(req.user && roles.includes(req.user.role) ? maskPersonalData(body) : body)
  next()
}
