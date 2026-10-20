import { notFound, validation, type DomainError } from '../../shared/errors'
import { err, ok, type Result } from '../../shared/result'

// Test VARK: 4 preguntas, cada respuesta (A/B/C) suma a un canal. Se guarda un resultado por jugador
// (reenviar el test lo reemplaza). El estilo dominante adapta el contenido del juego.

export const STYLES = ['Visual', 'Auditivo', 'Lector/Escritor'] as const
export type Style = (typeof STYLES)[number]
type Channel = 'visual' | 'auditory' | 'reading'

export type VarkScores = {
  readonly visual: number
  readonly auditory: number
  readonly reading: number
  readonly dominantStyle: Style
}

export type VarkProfile = VarkScores & { readonly id: string; readonly userId: string }

const ANSWER_MAP: Readonly<Record<string, Readonly<Record<string, Channel>>>> = {
  q1: { A: 'reading', B: 'visual', C: 'auditory' },
  q2: { A: 'auditory', B: 'reading', C: 'visual' },
  q3: { A: 'visual', B: 'auditory', C: 'reading' },
  q4: { A: 'reading', B: 'visual', C: 'auditory' },
}

const STYLE_OF: Readonly<Record<Channel, Style>> = { visual: 'Visual', auditory: 'Auditivo', reading: 'Lector/Escritor' }
const CHANNELS: readonly Channel[] = ['visual', 'auditory', 'reading']

const channelOf = ([question, answer]: readonly [string, unknown]): Channel | undefined =>
  typeof answer === 'string' ? ANSWER_MAP[question]?.[answer] : undefined

const countOf = (channels: readonly (Channel | undefined)[], c: Channel) => channels.filter((x) => x === c).length

// Empate: gana el primero en orden visual, auditivo, lector (igual que antes)
export const scoreVark = (answers: Readonly<Record<string, unknown>>): VarkScores => {
  const picked = Object.entries(answers).map(channelOf)
  const [visual, auditory, reading] = CHANNELS.map((c) => countOf(picked, c)) as [number, number, number]
  const top = CHANNELS.reduce((best, c) => (countOf(picked, c) > countOf(picked, best) ? c : best))
  return { visual, auditory, reading, dominantStyle: STYLE_OF[top] }
}

export const toAnswers = (v: unknown): Result<Readonly<Record<string, unknown>>, DomainError> =>
  v !== null && typeof v === 'object'
    ? ok(v as Record<string, unknown>)
    : err(validation('VARK_ANSWERS_REQUIRED', 'Se requiere el objeto answers'))

export const toStyle = (v: string): Result<Style, DomainError> =>
  (STYLES as readonly string[]).includes(v)
    ? ok(v as Style)
    : err(validation('VARK_INVALID_STYLE', `Estilo inválido. Usa: ${STYLES.join(', ')}`))

export const varkNotFound = (): DomainError => notFound('VARK_NOT_FOUND', 'No hay resultado VARK para este usuario')
