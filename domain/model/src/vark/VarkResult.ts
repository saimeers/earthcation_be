import type { VarkStyle } from './Style'

/** Puntaje de cada canal y el estilo dominante que sale de ellos. */
export interface VarkScores {
  readonly visual: number
  readonly auditory: number
  readonly reading: number
  readonly dominantStyle: VarkStyle
}

export interface VarkResultProps extends VarkScores {
  readonly id: string
  readonly userId: string
}

/**
 * Resultado del test VARK de un jugador. Hay uno por jugador: reenviar el test lo reemplaza (no hay historial).
 * El estilo dominante adapta el contenido del juego.
 */
export class VarkResult {
  private constructor(private readonly props: VarkResultProps) {}

  static restore(props: VarkResultProps): VarkResult {
    return new VarkResult({ ...props })
  }

  get id(): string { return this.props.id }
  get userId(): string { return this.props.userId }
  get visual(): number { return this.props.visual }
  get auditory(): number { return this.props.auditory }
  get reading(): number { return this.props.reading }
  get dominantStyle(): VarkStyle { return this.props.dominantStyle }

  toProps(): Readonly<VarkResultProps> { return { ...this.props } }
}
