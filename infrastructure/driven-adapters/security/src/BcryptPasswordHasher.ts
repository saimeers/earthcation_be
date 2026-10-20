import bcrypt from 'bcryptjs'
import type { PasswordHasher } from '@earthcation/model'

const COST = 12

/** Contraseñas con bcrypt (costo 12). */
export class BcryptPasswordHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, COST)
  }

  matches(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash)
  }
}
