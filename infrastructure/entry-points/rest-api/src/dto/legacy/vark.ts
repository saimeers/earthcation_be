import type { VarkResult, VarkScores } from '@earthcation/model'
import type { VarkSubmission } from '@earthcation/usecase'

// Respuestas legacy del test VARK: la misma forma snake_case de siempre (el juego y el panel las consumen).
// Los listados del panel son filas crudas (read model) y van tal cual.

const scoresLegacy = (s: VarkScores) =>
  ({ visual_score: s.visual, auditory_score: s.auditory, reading_score: s.reading, dominant_style: s.dominantStyle })

export const varkResultLegacy = (r: VarkResult) => ({ id: r.id, user_id: r.userId, ...scoresLegacy(r) })

export const varkSubmissionLegacy = (s: VarkSubmission) =>
  ({ message: s.created ? 'Test VARK completado' : 'Test VARK actualizado', result: scoresLegacy(s.scores) })
