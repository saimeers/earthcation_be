import { Resend } from 'resend'
import type { Mailer, PasswordResetMail, WelcomeMail } from '@earthcation/model'
import { passwordResetHtml, welcomeHtml } from './templates'

/** Lo lee y valida app-service (config/env.ts), nunca este paquete. */
export interface ResendConfig {
  readonly apiKey: string | undefined
  /** Panel web: el enlace del correo lleva a `<frontendUrl>/reset-password?token=…`. */
  readonly frontendUrl: string | undefined
  readonly from: string
}

interface Email {
  readonly to: string
  readonly subject: string
  readonly html: string
}

/** Correos transaccionales con Resend. */
export class ResendMailer implements Mailer {
  private client: Resend | undefined

  constructor(private readonly config: ResendConfig) {}

  async sendWelcome(mail: WelcomeMail): Promise<void> {
    const html = welcomeHtml(mail.name, mail.temporaryPassword, this.resetUrl(mail.resetToken))
    await this.send({ to: mail.to, subject: 'Tu cuenta en Earthcation ha sido creada', html })
  }

  async sendPasswordReset(mail: PasswordResetMail): Promise<void> {
    const html = passwordResetHtml(mail.name, this.resetUrl(mail.resetToken))
    await this.send({ to: mail.to, subject: 'Restablecer contraseña — Earthcation', html })
  }

  private resetUrl(token: string): string {
    return `${this.config.frontendUrl ?? ''}/reset-password?token=${token}`
  }

  private async send(email: Email): Promise<void> {
    const { error } = await this.resend().emails.send({ from: this.config.from, ...email })
    if (error) throw new Error('Error al enviar el correo')
  }

  // Al primer envío: sin RESEND_API_KEY la API arranca igual (Resend lanza al crearse sin clave)
  private resend(): Resend {
    this.client ??= new Resend(this.config.apiKey)
    return this.client
  }
}
