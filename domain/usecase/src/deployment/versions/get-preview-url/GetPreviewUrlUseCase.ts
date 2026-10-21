import {
  PREVIEW_TTL_S, previewPayload, SigningSecretMissingError, VersionNotFoundError,
  type Clock, type DeploySettings, type GameVersionRepository, type PreviewSigner, type PublishedStorage,
} from '@earthcation/model'
import type { GetPreviewUrlQuery } from './GetPreviewUrlQuery'

export interface PreviewLink {
  readonly url: string
  readonly expiresIn: number
}

export interface GetPreviewUrlDeps {
  readonly versions: GameVersionRepository
  readonly published: PublishedStorage
  readonly signer: PreviewSigner
  readonly clock: Clock
  readonly settings: DeploySettings
}

/** Enlace corto a una versión lista que valida el Worker: /v/<id>/?t=<exp>.<firma>. */
export class GetPreviewUrlUseCase {
  constructor(private readonly deps: GetPreviewUrlDeps) {}

  async execute(query: GetPreviewUrlQuery): Promise<PreviewLink> {
    const version = await this.deps.versions.findById(query.id)
    if (!version) throw new VersionNotFoundError()
    version.assertCanPreview()
    const base = this.deps.published.kind === 'local' ? `${query.apiBase}/play-local` : this.deps.settings.playUrl
    return { url: `${base}/v/${query.id}/?t=${this.token(query.id)}`, expiresIn: PREVIEW_TTL_S }
  }

  private token(id: string): string {
    const expiresAt = Math.floor(this.deps.clock.now().getTime() / 1000) + PREVIEW_TTL_S
    const signature = this.deps.signer.sign(previewPayload(id, expiresAt))
    if (signature === null) throw new SigningSecretMissingError()
    return `${expiresAt}.${signature}`
  }
}
