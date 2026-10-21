import { LoginEvent, type LoginEventRepository } from '@earthcation/model'
import type { RecordLoginCommand } from './RecordLoginCommand'

/** Deja la ubicación y el dispositivo de un inicio de sesión exitoso (quien llama decide qué hacer si falla). */
export class RecordLoginUseCase {
  constructor(private readonly logins: LoginEventRepository) {}

  execute(cmd: RecordLoginCommand): Promise<void> {
    return this.logins.save(LoginEvent.fromRequest(cmd))
  }
}
