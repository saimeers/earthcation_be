import { INTERRUPTED_PUBLISH, type GameVersionRepository } from '@earthcation/model'

/** Al arrancar: una publicación cortada por un reinicio queda fallida (la cola en memoria se perdió); se puede reintentar. */
export class RecoverInterruptedPublishesUseCase {
  constructor(private readonly versions: GameVersionRepository) {}

  async execute(): Promise<void> {
    await this.versions.failInterrupted(INTERRUPTED_PUBLISH)
  }
}
