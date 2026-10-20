import { timingSafeEqual } from 'node:crypto'
import { BlockList, isIP } from 'node:net'
import type { Request } from 'express'

/**
 * Rangos de Cloudflare, de https://www.cloudflare.com/ips/ (último cambio 2023-09-28). Actualizarlos si Cloudflare
 * publica otros.
 */
const CLOUDFLARE_IPV4 = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
  '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
  '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
]
const CLOUDFLARE_IPV6 = [
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32',
  '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
]

const addRanges = (list: BlockList, ranges: readonly string[], type: 'ipv4' | 'ipv6'): void => {
  ranges.map((r) => r.split('/')).forEach(([address = '', prefix]) => { list.addSubnet(address, Number(prefix), type) })
}

const cloudflare = new BlockList()
addRanges(cloudflare, CLOUDFLARE_IPV4, 'ipv4')
addRanges(cloudflare, CLOUDFLARE_IPV6, 'ipv6')

const normalize = (ip: unknown): string => (typeof ip === 'string' ? ip.replace(/^::ffff:(?=\d+\.)/, '') : '')

/** Comparación en tiempo constante (no revela cuántos caracteres coinciden). */
export const sameSecret = (got: unknown, secret: string): boolean => {
  const a = Buffer.from(typeof got === 'string' ? got : '')
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** La dirección es de un servidor de Cloudflare. */
export const isCloudflare = (ip: unknown): boolean => {
  const clean = normalize(ip)
  const version = isIP(clean)
  return version !== 0 && cloudflare.check(clean, version === 4 ? 'ipv4' : 'ipv6')
}

export interface CloudflareEdge {
  /** La petición pasó por el proxy de Cloudflare. */
  fromCloudflare(req: Request): boolean
  /** IP del visitante (CF-Connecting-IP solo si la petición viene de Cloudflare). */
  clientIp(req: Request): string | undefined
  isCloudflare(ip: unknown): boolean
}

/**
 * Detrás de Railway, req.ip no siempre es la IP de Cloudflare, así que una Transform Rule de la zona agrega
 * x-earthcation-edge con CF_EDGE_SECRET a todo lo que va a la API; quien llame directo al origen no conoce ese
 * valor. Sin secreto (o sin la cabecera) se decide por la dirección de req.ip.
 */
const hasEdgeHeader = (req: Request, edgeSecret: string | undefined): boolean =>
  edgeSecret !== undefined && edgeSecret !== '' && sameSecret(req.headers['x-earthcation-edge'], edgeSecret)

export const cloudflareEdge = (edgeSecret: string | undefined): CloudflareEdge => {
  const fromCloudflare = (req: Request): boolean => hasEdgeHeader(req, edgeSecret) || isCloudflare(req.ip)
  // Detrás del proxy, req.ip (con `trust proxy` 1) es un servidor de Cloudflare compartido por muchos visitantes;
  // CF-Connecting-IP solo se cree si la petición viene de verdad de Cloudflare (cualquiera podría inventarla)
  const clientIp = (req: Request): string | undefined => {
    const forwarded = normalize(req.get('cf-connecting-ip')?.trim())
    if (forwarded && isIP(forwarded) && fromCloudflare(req)) return forwarded
    return normalize(req.ip) || req.ip
  }
  return { fromCloudflare, clientIp, isCloudflare }
}
