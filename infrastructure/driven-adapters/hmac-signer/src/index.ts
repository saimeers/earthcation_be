import { createHmac } from 'node:crypto'
import type { PreviewSigner } from '@earthcation/model'

/** HMAC-SHA256 en base64url con el secreto compartido con el Worker (PLAY_SIGNING_SECRET); sin secreto no firma. */
export class HmacPreviewSigner implements PreviewSigner {
  constructor(private readonly secret: string | undefined) {}

  sign(payload: string): string | null {
    return this.secret === undefined ? null : createHmac('sha256', this.secret).update(payload).digest('base64url')
  }
}
