import { InvalidVarkStyleError } from './errors/VarkErrors'

/** Estilos de aprendizaje del test VARK (así se guardan y así los filtra el panel). */
export const VARK_STYLES = ['Visual', 'Auditivo', 'Lector/Escritor'] as const
export type VarkStyle = (typeof VARK_STYLES)[number]

export const isVarkStyle = (v: unknown): v is VarkStyle =>
  typeof v === 'string' && (VARK_STYLES as readonly string[]).includes(v)

/** Valida el estilo que llega de afuera (p. ej. /by-style/:style). */
export const parseVarkStyle = (v: unknown): VarkStyle => {
  if (!isVarkStyle(v)) throw new InvalidVarkStyleError(VARK_STYLES)
  return v
}
