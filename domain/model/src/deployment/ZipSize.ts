import { VersionSizeRequiredError, ZipTooLargeError } from './errors/DeploymentErrors'

const MB = 1024 * 1024

/** Tamaño declarado del ZIP: entero positivo y dentro del máximo configurado (DEPLOY_MAX_MB). */
export class ZipSize {
  private constructor(readonly bytes: number) {}

  static of(raw: unknown, maxMb: number): ZipSize {
    const bytes = Number(raw)
    if (!Number.isInteger(bytes) || bytes <= 0) throw new VersionSizeRequiredError()
    if (bytes > maxMb * MB) throw new ZipTooLargeError(maxMb)
    return new ZipSize(bytes)
  }
}
