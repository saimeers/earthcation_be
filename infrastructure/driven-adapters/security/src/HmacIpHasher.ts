import { createHmac } from 'node:crypto'
import type { IpHasher } from '@earthcation/model'

/** Huella de una IP: HMAC-SHA256 con una sal del servicio. Sin la sal no se puede revertir ni recalcular. */
export class HmacIpHasher implements IpHasher {
  constructor(private readonly salt: string) {}

  hash(ip: string | undefined): string | null {
    if (!ip) return null
    return createHmac('sha256', this.salt).update(ip).digest('hex')
  }
}
