export interface WelcomeMail {
  readonly to: string
  /** Cómo se saluda (nombre o, si no tiene, usuario). */
  readonly name: string
  readonly temporaryPassword: string
  readonly resetToken: string
}

export interface PasswordResetMail {
  readonly to: string
  readonly name: string
  readonly resetToken: string
}

/** Puerto de salida: correos transaccionales. Lanza si el envío falla. */
export interface Mailer {
  sendWelcome(mail: WelcomeMail): Promise<void>
  sendPasswordReset(mail: PasswordResetMail): Promise<void>
}

/** Puerto de salida: deja en el log un fallo que no interrumpe la operación. */
export interface ErrorReporter {
  report(message: string): void
}
