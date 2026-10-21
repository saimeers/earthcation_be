import { CedulaRequiredError } from '../errors/IdentityErrors'
import { formText } from './formText'

/** Documento de identidad: la identidad real del jugador (con ella entra al juego; el correo no es único). */
export class Cedula {
  private constructor(readonly value: string) {}

  /** null si viene vacía. */
  static from(v: unknown): Cedula | null {
    const text = formText(v)
    return text === null ? null : new Cedula(text)
  }

  static required(v: unknown): Cedula {
    const cedula = Cedula.from(v)
    if (!cedula) throw new CedulaRequiredError()
    return cedula
  }

  toString(): string { return this.value }
}
