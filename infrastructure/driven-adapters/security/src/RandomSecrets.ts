import { createHash, randomBytes, randomInt } from 'node:crypto'
import type { PasswordGenerator, ResetTokenService } from '@earthcation/model'

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const DIGITS = '0123456789'
const SPECIAL = '!@#$'

const pickFrom = (chars: string): string => chars[randomInt(0, chars.length)] ?? ''

/** 10 caracteres con al menos uno de cada tipo, mezclados con claves aleatorias criptográficas. */
export class RandomPasswordGenerator implements PasswordGenerator {
  generate(): string {
    const chars = [pickFrom(UPPER), pickFrom(LOWER), pickFrom(DIGITS), pickFrom(SPECIAL),
      ...Array.from({ length: 6 }, () => pickFrom(UPPER + LOWER + DIGITS + SPECIAL))]
    return chars.map((c) => [randomInt(0, 2 ** 31), c] as const).toSorted(([a], [b]) => a - b).map(([, c]) => c).join('')
  }
}

/** 32 bytes aleatorios en hex para el enlace; en la BD solo queda su SHA-256. */
export class Sha256ResetTokenService implements ResetTokenService {
  generate(): string {
    return randomBytes(32).toString('hex')
  }

  hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex')
  }
}
