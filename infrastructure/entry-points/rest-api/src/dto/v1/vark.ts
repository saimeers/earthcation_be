import type { VarkResult, VarkScores } from '@earthcation/model'
import type { VarkSubmission } from '@earthcation/usecase'

// Respuestas v1 del test VARK: la misma forma snake_case de siempre (el juego y el panel las consumen).
// Los listados del panel son filas crudas (read model) y van tal cual.

const scoresV1 = (s: VarkScores) =>
  ({ visual_score: s.visual, auditory_score: s.auditory, reading_score: s.reading, dominant_style: s.dominantStyle })

export const varkResultV1 = (r: VarkResult) => ({ id: r.id, user_id: r.userId, ...scoresV1(r) })

export const varkSubmissionV1 = (s: VarkSubmission) =>
  ({ message: s.created ? 'Test VARK completado' : 'Test VARK actualizado', result: scoresV1(s.scores) })
