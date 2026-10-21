import type { Role } from '../AuthenticatedUser'

/** De dónde llegó la petición de login (IP del proxy y encabezados, p. ej. los de ubicación de Cloudflare). */
export interface LoginOrigin {
  readonly ip: string | undefined
  readonly headers: Readonly<Record<string, string | string[] | undefined>>
}

export interface LoginRecord {
  readonly userId: string
  readonly role: Role
  readonly origin: LoginOrigin
}

/** Puerto de salida: registra el inicio de sesión sin bloquear la respuesta (si falla, solo queda en el log). */
export interface LoginRecorder {
  record(login: LoginRecord): void
}
