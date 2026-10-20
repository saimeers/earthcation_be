import { createHash, randomBytes, randomInt } from 'node:crypto'
import * as XLSX from 'xlsx'
import hashing from '../../utils/hash.utils'
import jwt from '../../utils/jwt.utils'
import email from '../../utils/email.utils'
import type { Mailer, Passwords, ResetTokens, SpreadsheetReader, TokenIssuer } from './ports'

// Adaptadores de cripto, JWT, correo (Resend) y Excel. hash/jwt/email siguen en utils/ porque los usan el
// middleware de auth, el límite de peticiones y las pruebas (que reemplazan las funciones de correo).

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const DIGITS = '0123456789'
const SPECIAL = '!@#$'

const pickFrom = (chars: string): string => chars[randomInt(0, chars.length)] ?? ''

// 10 caracteres con al menos uno de cada tipo, mezclados con claves aleatorias criptográficas
const randomPassword = (): string => {
  const chars = [pickFrom(UPPER), pickFrom(LOWER), pickFrom(DIGITS), pickFrom(SPECIAL),
    ...Array.from({ length: 6 }, () => pickFrom(UPPER + LOWER + DIGITS + SPECIAL))]
  return chars.map((c) => [randomInt(0, 2 ** 31), c] as const).toSorted(([a], [b]) => a - b).map(([, c]) => c).join('')
}

export const passwords: Passwords = {
  hash: (plain) => hashing.hashPassword(plain),
  matches: (plain, hash) => hashing.comparePassword(plain, hash),
  generate: randomPassword,
}

export const resetTokens: ResetTokens = {
  generate: () => randomBytes(32).toString('hex'),
  hash: (raw) => createHash('sha256').update(raw).digest('hex'),
}

// jsonwebtoken no trae tipos: generateToken devuelve el JWT firmado como texto
export const tokens: TokenIssuer = { issue: (claims) => jwt.generateToken(claims) as string }

// Se busca la función en cada envío: las pruebas la reemplazan después de cargar el módulo
export const mailer: Mailer = {
  welcome: (m) => email.sendWelcomeEmail(m),
  passwordReset: (m) => email.sendPasswordResetEmail(m),
}

export const spreadsheets: SpreadsheetReader = {
  firstSheet: (file) => {
    const book = XLSX.read(file, { type: 'buffer' })
    const sheet = book.Sheets[book.SheetNames[0] ?? '']
    return sheet ? XLSX.utils.sheet_to_json<readonly unknown[]>(sheet, { header: 1, defval: '' }) : []
  },
}
