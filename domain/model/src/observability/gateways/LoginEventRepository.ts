import type { LoginEvent } from '../LoginEvent'

/** Puerto de salida: guarda los inicios de sesión con su ubicación. */
export interface LoginEventRepository {
  save(event: LoginEvent): Promise<void>
}
