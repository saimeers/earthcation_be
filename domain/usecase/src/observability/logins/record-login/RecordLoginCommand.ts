import type { LoginRequest } from '@earthcation/model'

/** Quién inició sesión, con las cabeceras de la petición y si pasó por Cloudflare. */
export type RecordLoginCommand = LoginRequest
