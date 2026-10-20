export interface ResetPasswordCommand {
  /** El token que llegó en el enlace del correo. */
  readonly token: unknown
  readonly password: unknown
}
