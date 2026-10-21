import { VarkAnswersRequiredError } from './errors/VarkErrors'
import type { VarkStyle } from './Style'
import type { VarkScores } from './VarkResult'

type Channel = 'visual' | 'auditory' | 'reading'

// 4 preguntas; cada respuesta (A/B/C) suma a un canal
const ANSWER_MAP: Readonly<Record<string, Readonly<Record<string, Channel>>>> = {
  q1: { A: 'reading', B: 'visual', C: 'auditory' },
  q2: { A: 'auditory', B: 'reading', C: 'visual' },
  q3: { A: 'visual', B: 'auditory', C: 'reading' },
  q4: { A: 'reading', B: 'visual', C: 'auditory' },
}

const STYLE_OF: Readonly<Record<Channel, VarkStyle>> = { visual: 'Visual', auditory: 'Auditivo', reading: 'Lector/Escritor' }
// Orden de desempate: gana el primero (visual, auditivo, lector), igual que antes
const CHANNELS: readonly Channel[] = ['visual', 'auditory', 'reading']

const channelOf = ([question, answer]: readonly [string, unknown]): Channel | undefined =>
  typeof answer === 'string' ? ANSWER_MAP[question]?.[answer] : undefined

/** Respuestas del test (`{ q1: 'A', … }`); preguntas o respuestas desconocidas no suman. */
export class VarkAnswers {
  private constructor(private readonly answers: Readonly<Record<string, unknown>>) {}

  static from(v: unknown): VarkAnswers {
    if (v === null || typeof v !== 'object') throw new VarkAnswersRequiredError()
    return new VarkAnswers({ ...(v as Record<string, unknown>) })
  }

  score(): VarkScores {
    const picked = Object.entries(this.answers).map(channelOf)
    const count = (c: Channel) => picked.filter((x) => x === c).length
    const top = CHANNELS.reduce((best, c) => (count(c) > count(best) ? c : best))
    return { visual: count('visual'), auditory: count('auditory'), reading: count('reading'), dominantStyle: STYLE_OF[top] }
  }
}
