// Etiquetas en español para los valores que envía el juego (ver docs/TELEMETRY.md). Las usa el Excel de la
// sesión; el panel web tiene su propia copia en `earthcation_fe/src/lib/format.js`.

const FAIL_REASONS: Readonly<Record<string, string>> = {
  derrumbe: 'Derrumbe',
  intoxicacion_metano: 'Intoxicación por metano',
  mordedura_ofidio: 'Mordedura de serpiente',
  infeccion_por_hongos: 'Infección por hongos',
  lesion_por_fatiga: 'Lesión por fatiga',
  impacto_proyeccion: 'Impacto por proyección de fragmentos',
  fatiga: 'Lesión por fatiga',
  desconocido: 'Desconocida',
}

export const OUTCOMES: Readonly<Record<string, string>> = {
  completed: 'Completado', failed: 'Fallido', abandoned: 'Abandonado', in_progress: 'En curso',
}

export const BANDS = {
  destacado: 'Destacado', en_progreso: 'En progreso', refuerzo: 'Necesita refuerzo', sin_datos: 'Sin datos',
} as const

export const SESSION_STATUS: Readonly<Record<string, string>> = { waiting: 'En espera', active: 'En curso', finished: 'Finalizada' }

const STAGE_PREFIXES: readonly (readonly [string, string])[] = [
  ['PickingMuro', 'Picando muro'], ['WagonToSurface', 'Vagón a superficie'], ['PlacingSupport', 'Colocando sostenimiento'],
  ['WagonReturning', 'Vagón de regreso'], ['Support', 'Sostenimiento'], ['Methane', 'Metano'], ['Hazard', 'Riesgo biológico'],
]

export const stageLabel = (stage: unknown): string => {
  if (typeof stage !== 'string' || stage === '') return ''
  const match = STAGE_PREFIXES.find(([prefix]) => stage.startsWith(prefix))
  return match ? `${match[1]} ${stage.slice(match[0].length)}`.trim() : stage
}

const CHALLENGES: Readonly<Record<string, string>> = { reto_reaccion: 'Reto de reacción', reto_memoria: 'Reto de memoria' }

export const levelLabel = (key: unknown): string => {
  const text = typeof key === 'string' ? key : ''
  const n = text.replace(/\D/g, '')
  return CHALLENGES[text] ?? (n ? `Nivel ${n}` : text)
}

export const failReasonLabel = (reason: unknown): string =>
  typeof reason === 'string' && reason !== '' ? (FAIL_REASONS[reason] ?? reason) : ''
