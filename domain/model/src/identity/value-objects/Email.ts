import { EmailRequiredError } from '../errors/IdentityErrors'
import { formText } from './formText'

/**
 * Correo de contacto. NO es único: muchos trabajadores importados comparten el de la empresa. El formato lo valida
 * la persistencia (isEmail) como siempre.
 */
export class Email {
  private constructor(readonly value: string) {}

  /** null si viene vacío. */
  static from(v: unknown): Email | null {
    const text = formText(v)
    return text === null ? null : new Email(text)
  }

  static required(v: unknown): Email {
    const email = Email.from(v)
    if (!email) throw new EmailRequiredError()
    return email
  }

  toString(): string { return this.value }
}
