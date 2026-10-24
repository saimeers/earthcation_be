import type { RequestHandler } from 'express'
import { DeployTokenInvalidError } from '@earthcation/model'
import { sameSecret } from './cloudflare'

declare module 'express-serve-static-core' {
  interface Request {
    /** La petición entró con el token de despliegue del CI (lo deja `acceptDeployToken`); no hay `user`. */
    deployer?: true
  }
}

/** Cabecera con la que el CI del juego sube versiones (DEPLOY_UPLOAD_TOKEN). */
export const DEPLOY_TOKEN_HEADER = 'x-deploy-token'

// Sin token configurado (o vacío) ninguna cabecera es válida
const matches = (sent: unknown, secret: string | undefined): boolean =>
  secret !== undefined && secret !== '' && sameSecret(sent, secret)

/**
 * Primer registro de una ruta con `deployToken`. Sin la cabecera, `next('route')` pasa la petición al registro normal
 * de la misma ruta (token de usuario y roles), así que para el panel no cambia nada. Con la cabecera manda ella: si
 * coincide con el token configurado la petición sigue como del CI; si no coincide, o no hay token configurado, es 401.
 */
export const acceptDeployToken = (secret: string | undefined, onDeployer?: () => void): RequestHandler => (req, _res, next) => {
  const sent = req.headers[DEPLOY_TOKEN_HEADER]
  if (sent === undefined) { next('route'); return }
  if (!matches(sent, secret)) throw new DeployTokenInvalidError()
  // eslint-disable-next-line no-param-reassign -- así pasa Express datos entre middlewares
  req.deployer = true
  onDeployer?.()
  next()
}
