import {
  ActivationPointer, VersionNotFoundError, type Clock, type GameVersion, type GameVersionRepository, type PublishedStorage,
} from '@earthcation/model'

export interface ActivateVersionDeps {
  readonly versions: GameVersionRepository
  readonly published: PublishedStorage
  readonly clock: Clock
}

/** Activa una versión lista: escribe current.json (lo lee el Worker) dentro de la transacción. Rollback = activar otra. */
export class ActivateVersionUseCase {
  constructor(private readonly deps: ActivateVersionDeps) {}

  async execute(id: string): Promise<GameVersion> {
    const { versions, published, clock } = this.deps
    const version = await this.found(id)
    version.activate(clock.now())
    await versions.activate(version, () => published.put(ActivationPointer.key, ActivationPointer.of(version), ActivationPointer.headers))
    return this.found(id)
  }

  private async found(id: string): Promise<GameVersion> {
    const version = await this.deps.versions.findById(id)
    if (!version) throw new VersionNotFoundError()
    return version
  }
}
