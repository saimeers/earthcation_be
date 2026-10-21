import { NewRoomInput, roomCode, type SessionRepository, type SessionRow } from '@earthcation/model'
import type { CreateRoomCommand } from './CreateRoomCommand'

/** Abre una sala con un código de 3 dígitos único entre las salas vivas (`POST /api/sessions`). */
export class CreateRoomUseCase {
  constructor(private readonly repo: SessionRepository, private readonly random: () => number) {}

  async execute(cmd: CreateRoomCommand): Promise<SessionRow> {
    const input = NewRoomInput.from(cmd.body)
    const code = await this.freeCode()
    return this.repo.create({ instructorId: cmd.instructorId, locationId: input.locationId, name: input.name, code })
  }

  // Solo choca contra salas vivas: una finalizada libera su código (3 dígitos = 1000 combinaciones)
  private async freeCode(): Promise<string> {
    const code = roomCode(this.random)
    return (await this.repo.codeInUse(code)) ? this.freeCode() : code
  }
}
