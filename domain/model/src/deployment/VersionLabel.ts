import { VersionLabelInvalidError } from './errors/DeploymentErrors'

const LABEL = /^[\w.\- ]{1,40}$/

/** Etiqueta de una versión del juego ("1.4.0"): letras, números, punto, guion o espacio, máx. 40. */
export class VersionLabel {
  private constructor(readonly value: string) {}

  /** Acepta texto o número (el panel puede mandar 2 en vez de "2"); recorta espacios. */
  static of(raw: unknown): VersionLabel {
    const label = typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : ''
    if (!LABEL.test(label)) throw new VersionLabelInvalidError()
    return new VersionLabel(label)
  }
}
