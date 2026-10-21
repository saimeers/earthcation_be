import type { LearningRow } from '@earthcation/model'

// Respuestas legacy de aprendizaje: la mayoría son filas crudas (read model) tal como siempre; solo las escrituras
// llevan un mensaje además del dato.

export const savedProgressLegacy = (progress: LearningRow) => ({ message: 'Progreso guardado', progress })

export const fullProgressLegacy = (userId: string, progress: readonly LearningRow[]) =>
  ({ user_id: userId, total_attempts: progress.length, progress })

export const startedAttemptLegacy = (attempt: LearningRow) => ({ message: 'Intento iniciado', attempt })

export const endedAttemptLegacy = (attempt: LearningRow) => ({ message: 'Intento actualizado', attempt })

export const savedEventsLegacy = (saved: number) => ({ message: 'Eventos guardados', saved })
