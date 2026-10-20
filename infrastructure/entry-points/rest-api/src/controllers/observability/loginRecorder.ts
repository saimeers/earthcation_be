import type { Request } from 'express'
import type { RecordLoginUseCase } from '@earthcation/usecase'

/** Usuario que acaba de iniciar sesión (lo da el login). */
export interface LoggedUser { readonly id: string; readonly role: string }

export type LoginRecorder = (req: Request, user: LoggedUser) => void

export interface LoginRecorderDeps {
  readonly recordLogin: RecordLoginUseCase
  /** Si la petición llegó por Cloudflare (solo entonces se creen las cabeceras cf-*). */
  readonly fromCloudflare: (req: Request) => boolean
  readonly log: (message: string) => void
}

/** Guarda la ubicación del inicio de sesión sin bloquear la respuesta del login: si falla, solo queda en el log. */
export const loginRecorder = (deps: LoginRecorderDeps): LoginRecorder => (req, user) => {
  const cmd = { userId: user.id, role: user.role, headers: req.headers, fromCloudflare: deps.fromCloudflare(req) }
  void deps.recordLogin.execute(cmd).catch((e: unknown) => {
    deps.log(`[login-event] ${e instanceof Error ? e.message : String(e)}`)
  })
}
