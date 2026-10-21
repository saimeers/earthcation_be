import type { LearningRow } from '@earthcation/model'

// Respuestas v1 de aprendizaje: la mayoría son filas crudas (read model) tal como siempre; solo las escrituras
// llevan un mensaje además del dato.

export const savedProgressV1 = (progress: LearningRow) => ({ message: 'Progreso guardado', progress })

export const fullProgressV1 = (userId: string, progress: readonly LearningRow[]) =>
  ({ user_id: userId, total_attempts: progress.length, progress })

export const startedAttemptV1 = (attempt: LearningRow) => ({ message: 'Intento iniciado', attempt })

export const endedAttemptV1 = (attempt: LearningRow) => ({ message: 'Intento actualizado', attempt })

export const savedEventsV1 = (saved: number) => ({ message: 'Eventos guardados', saved })
