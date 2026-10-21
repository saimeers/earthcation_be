import {
  UploadPresignedOnlyError, VersionNotFoundError, ZipBodyRequiredError, type GameVersionRepository, type OriginalsStorage,
} from '@earthcation/model'
import type { ReceiveLocalZipCommand } from './ReceiveLocalZipCommand'

export interface ReceiveLocalZipDeps {
  readonly versions: GameVersionRepository
  readonly originals: OriginalsStorage
}

/** Solo en desarrollo (sin S3): el ZIP llega a la API en el cuerpo del PUT; con S3 va a la URL prefirmada. */
export class ReceiveLocalZipUseCase {
  constructor(private readonly deps: ReceiveLocalZipDeps) {}

  async execute(cmd: ReceiveLocalZipCommand): Promise<void> {
    if (cmd.zip === null || cmd.zip.length === 0) throw new ZipBodyRequiredError()
    if (this.deps.originals.kind !== 'local') throw new UploadPresignedOnlyError()
    const version = await this.deps.versions.findById(cmd.id)
    if (!version) throw new VersionNotFoundError()
    version.assertAwaitingZip()
    await this.deps.originals.put(version.storedOriginalKey, cmd.zip)
  }
}
