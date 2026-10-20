import {
  VersionNotFoundError, VersionStateChangedError, ZipMissingError,
  type GameVersion, type GameVersionRepository, type OriginalsStorage, type PublishQueue,
} from '@earthcation/model'

export interface CompleteUploadDeps {
  readonly versions: GameVersionRepository
  readonly originals: OriginalsStorage
  /** La publicación la hace publish-version cuando la cola la toma (el container conecta ambos). */
  readonly queue: PublishQueue
}

/** El ZIP ya subió (o se reintenta una fallida): pasa a 'processing' y encola la publicación. */
export class CompleteUploadUseCase {
  constructor(private readonly deps: CompleteUploadDeps) {}

  async execute(id: string): Promise<GameVersion> {
    const version = await this.found(id)
    version.assertCanComplete()
    const size = await this.deps.originals.size(version.storedOriginalKey)
    if (size === null) throw new ZipMissingError()
    const from = version.startProcessing(size)
    if (!(await this.deps.versions.startProcessing(version, from))) throw new VersionStateChangedError()
    this.deps.queue.enqueue(version.id)
    return this.found(id)
  }

  private async found(id: string): Promise<GameVersion> {
    const version = await this.deps.versions.findById(id)
    if (!version) throw new VersionNotFoundError()
    return version
  }
}
