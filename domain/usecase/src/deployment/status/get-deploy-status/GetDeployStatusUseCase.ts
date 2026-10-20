import type {
  DeploySettings, GameVersion, GameVersionRepository, OriginalsStorage, PublishedStorage,
} from '@earthcation/model'

export interface DeployStatus {
  /** null en desarrollo: el juego se sirve en /play-local, no en el Worker. */
  readonly playUrl: string | null
  readonly storage: { readonly originals: OriginalsStorage['kind']; readonly published: PublishedStorage['kind'] }
  readonly maxMb: number
  readonly active: GameVersion | null
}

export interface GetDeployStatusDeps {
  readonly versions: GameVersionRepository
  readonly originals: OriginalsStorage
  readonly published: PublishedStorage
  readonly settings: DeploySettings
}

/** Dónde se guarda y se publica, el máximo del ZIP y la versión activa. */
export class GetDeployStatusUseCase {
  constructor(private readonly deps: GetDeployStatusDeps) {}

  async execute(): Promise<DeployStatus> {
    const { versions, originals, published, settings } = this.deps
    const activeId = await versions.activeId()
    return {
      playUrl: published.kind === 'local' ? null : settings.playUrl,
      storage: { originals: originals.kind, published: published.kind },
      maxMb: settings.maxMb,
      active: activeId === null ? null : await versions.findById(activeId),
    }
  }
}
