import {
  BuildInspection, GameVersion, InvalidZipError,
  type BuildFile, type Clock, type DeploymentLog, type GameVersionRepository, type InspectedBuild, type OriginalsStorage,
  type PublishedStorage, type ZipReader,
} from '@earthcation/model'

export interface PublishVersionDeps {
  readonly versions: GameVersionRepository
  readonly originals: OriginalsStorage
  readonly published: PublishedStorage
  readonly zips: ZipReader
  readonly clock: Clock
  readonly log: DeploymentLog
}

const UPLOAD_CONCURRENCY = 8

const chunks = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size))

const reasonOf = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/**
 * Publica en segundo plano una versión en 'processing' (lo ejecuta la cola, no una petición): valida el ZIP como
 * build WebGL y sube cada archivo a builds/<id>/ con sus headers → 'ready'; cualquier fallo queda como 'failed' con
 * el motivo, para reintentar desde el panel.
 */
export class PublishVersionUseCase {
  constructor(private readonly deps: PublishVersionDeps) {}

  async execute(id: string): Promise<void> {
    const version = await this.deps.versions.findById(id)
    if (version?.status !== 'processing') return
    const started = this.deps.clock.now().getTime()
    try {
      await this.publish(version, started)
    } catch (e) {
      await this.fail(version, reasonOf(e))
    }
  }

  private async publish(version: GameVersion, started: number): Promise<void> {
    const build = await this.readBuild(version)
    await this.upload(GameVersion.publishedPrefixFor(version.id), build.files)
    const now = this.deps.clock.now()
    version.markReady(build.manifest, now.getTime() - started, now)
    await this.deps.versions.save(version)
    this.deps.log.info(`[deploy] versión ${version.label} publicada (${build.files.length} archivos, ${now.getTime() - started} ms)`)
  }

  private async readBuild(version: GameVersion): Promise<InspectedBuild> {
    const entries = this.deps.zips.read(await this.deps.originals.read(version.storedOriginalKey))
    if (entries === null) throw new InvalidZipError()
    return BuildInspection.inspect(entries)
  }

  private async upload(prefix: string, files: readonly BuildFile[]): Promise<void> {
    const { published } = this.deps
    await published.removePrefix(prefix) // por si es un reintento
    for (const batch of chunks(files, UPLOAD_CONCURRENCY)) {
      await Promise.all(batch.map((f) => published.put(prefix + f.path, f.data, BuildInspection.headersFor(f.path))))
    }
  }

  private async fail(version: GameVersion, reason: string): Promise<void> {
    this.deps.log.error(`[deploy] falló la versión ${version.label}: ${reason}`)
    version.markFailed(reason)
    await this.deps.versions.save(version)
  }
}
