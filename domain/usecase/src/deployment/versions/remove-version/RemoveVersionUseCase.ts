import {
  GameVersion, VersionNotFoundError, type GameVersionRepository, type OriginalsStorage, type PublishedStorage,
} from '@earthcation/model'

export interface RemoveVersionDeps {
  readonly versions: GameVersionRepository
  readonly originals: OriginalsStorage
  readonly published: PublishedStorage
}

/** Borra la versión con su ZIP original y sus archivos publicados (no la activa ni la que se publica). */
export class RemoveVersionUseCase {
  constructor(private readonly deps: RemoveVersionDeps) {}

  async execute(id: string): Promise<void> {
    const { versions, originals, published } = this.deps
    const activeId = await versions.activeId()
    const version = await versions.findById(id)
    if (!version) throw new VersionNotFoundError()
    version.assertCanRemove(activeId)
    const { originalKey } = version
    await Promise.all([originalKey && originals.remove(originalKey), published.removePrefix(GameVersion.publishedPrefixFor(id))])
    await versions.remove(id)
  }
}
