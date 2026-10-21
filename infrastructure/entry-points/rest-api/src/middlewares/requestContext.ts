import type { Request, RequestHandler } from 'express'
import type { IpHasher, RequestContext } from '@earthcation/model'

const USER_AGENT_MAX = 300

/**
 * Abre el ámbito de la petición (huella de la IP del visitante y navegador) para que lo que corra después, incluida la
 * auditoría de los casos de uso, sepa desde dónde se hizo. Va antes de cualquier ruta.
 */
export const requestContext = (context: RequestContext, ips: IpHasher, clientIp: (req: Request) => string | undefined): RequestHandler =>
  (req, _res, next) => {
    const userAgent = req.headers['user-agent']
    context.run({ ipHash: ips.hash(clientIp(req)), userAgent: userAgent ? userAgent.slice(0, USER_AGENT_MAX) : null }, next)
  }
