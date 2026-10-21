import { z } from 'zod'

// Cuerpos y respuestas v1 de aprendizaje (progreso por riesgo, niveles, intentos y eventos del juego, analíticas).
// Las lecturas salen de camelize (v1/dto/camelize.ts); los esquemas documentan lo estable y dejan abierto el resto.

export const OUTCOMES = ['in_progress', 'completed', 'failed', 'abandoned'] as const

/** Lo que el juego manda al terminar un riesgo (mitigado o no, errores y reacción). */
export const riskResultBody = z.object({
  riskId: z.string().min(1).describe('Id del riesgo, p. ej. CR-01'),
  sessionId: z.uuid().nullable().optional(),
  attemptId: z.uuid().nullable().optional(),
  isMitigated: z.boolean().optional(),
  mistakesCount: z.number().int().min(0).optional(),
  reactionTimeMs: z.number().int().min(0).nullable().optional(),
  detail: z.unknown().optional().describe('JSON del juego; sus claves se guardan en snake_case y se responden en camelCase'),
})

export const riskResultDto = z.looseObject({
  id: z.string(),
  userId: z.string(),
  riskId: z.string(),
  isMitigated: z.boolean(),
  mistakesCount: z.number().int(),
  reactionTimeMs: z.number().int().nullable(),
  recordedAt: z.iso.datetime(),
})

export const levelDto = z.looseObject({ id: z.number().int(), name: z.string() })

export const levelProgressDto = z.looseObject({}).describe('Avance del jugador en el nivel: riesgos mitigados y pendientes')

export const startAttemptBody = z.object({
  levelKey: z.string().min(1).describe('Clave del nivel, p. ej. level1'),
  sessionId: z.uuid().nullable().optional().describe('Sala; sin ella cuenta en el Juego libre de la localidad'),
  varkStyle: z.string().nullable().optional(),
  gasBrand: z.string().nullable().optional(),
  gameVersion: z.string().max(20).nullable().optional(),
})

export const endAttemptBody = z.object({
  outcome: z.enum(OUTCOMES).optional().describe('Un resultado distinto de in_progress cierra el intento'),
  failReason: z.string().nullable().optional(),
  failRiskId: z.string().nullable().optional(),
  failStage: z.string().nullable().optional(),
  durationMs: z.number().int().min(0).nullable().optional(),
  finalHealth: z.number().min(0).nullable().optional(),
  deviceCalibrated: z.boolean().optional(),
  gasBrand: z.string().nullable().optional(),
  summary: z.unknown().optional().describe('JSON del juego; sus claves se guardan en snake_case y se responden en camelCase'),
})

export const attemptDto = z.looseObject({
  id: z.string(),
  userId: z.string(),
  levelKey: z.string(),
  sessionId: z.string().nullable(),
  outcome: z.enum(OUTCOMES),
  startedAt: z.iso.datetime().optional(),
  endedAt: z.iso.datetime().nullable().optional(),
})

const MAX_EVENTS = 500

export const eventsBody = z.object({
  events: z.array(z.object({
    eventType: z.string().min(1),
    riskId: z.string().nullable().optional(),
    stage: z.string().nullable().optional(),
    tMs: z.number().int().min(0).nullable().optional(),
    posX: z.number().nullable().optional(),
    health: z.number().nullable().optional(),
    fatigue: z.number().nullable().optional(),
    payload: z.unknown().optional().describe('JSON libre del juego: se guarda y se responde tal cual, sin cambiar sus claves'),
  })).min(1).max(MAX_EVENTS).describe(`Lote de eventos del intento (hasta ${MAX_EVENTS})`),
})

export const savedEventsDto = z.object({ saved: z.number().int().describe('Cuántos eventos se guardaron') })

export const attemptDetailDto = z.looseObject({}).describe('El intento con sus resultados por riesgo y sus eventos')
export const summaryDto = z.looseObject({}).describe('Resumen de telemetría')
export const analyticsDto = z.looseObject({}).describe('Indicadores y desgloses de analítica')
