import {
  GameVersion, type DeploySettings, type GameVersionRepository, type IdGenerator, type OriginalsStorage,
} from '@earthcation/model'
import type { CreateVersionCommand } from './CreateVersionCommand'

/** Adónde sube el ZIP el panel: a S3 con URL prefirmada, o a la API (desarrollo, sin S3). */
export type UploadTarget = { readonly mode: 'presigned'; readonly url: string } | { readonly mode: 'api' }

export interface CreatedVersion {
  readonly version: GameVersion
  readonly upload: UploadTarget
}

export interface CreateVersionDeps {
  readonly versions: GameVersionRepository
  readonly originals: OriginalsStorage
  readonly ids: IdGenerator
  readonly settings: DeploySettings
}

/** Registra la versión en 'uploading' y dice adónde subir el ZIP. */
export class CreateVersionUseCase {
  constructor(private readonly deps: CreateVersionDeps) {}

  async execute(cmd: CreateVersionCommand): Promise<CreatedVersion> {
    const draft = GameVersion.prepare(this.deps.ids.newId(), cmd, this.deps.settings.maxMb)
    const version = await this.deps.versions.create(draft)
    return { version, upload: await this.uploadTarget(draft.originalKey, draft.sizeBytes) }
  }

  private async uploadTarget(key: string, sizeBytes: number): Promise<UploadTarget> {
    const { originals } = this.deps
    return originals.kind === 's3' ? { mode: 'presigned', url: await originals.presignPut(key, sizeBytes) } : { mode: 'api' }
  }
}
