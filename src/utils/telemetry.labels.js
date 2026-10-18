// Etiquetas en español para los valores que envía el juego (ver docs/TELEMETRY.md). Las usa la
// exportación a Excel; el panel web tiene su propia copia en `earthcation_fe/src/lib/format.js`.

const FAIL_REASONS = {
  derrumbe:             'Derrumbe',
  intoxicacion_metano:  'Intoxicación por metano',
  mordedura_ofidio:     'Mordedura de serpiente',
  infeccion_por_hongos: 'Infección por hongos',
  lesion_por_fatiga:    'Lesión por fatiga',
  impacto_proyeccion:   'Impacto por proyección de fragmentos',
  fatiga:               'Lesión por fatiga',
  desconocido:          'Desconocida',
};

const OUTCOMES = {
  completed:   'Completado',
  failed:      'Fallido',
  abandoned:   'Abandonado',
  in_progress: 'En curso',
};

const BANDS = {
  destacado:   'Destacado',
  en_progreso: 'En progreso',
  refuerzo:    'Necesita refuerzo',
  sin_datos:   'Sin datos',
};

const STAGE_PREFIXES = [
  ['PickingMuro',     'Picando muro'],
  ['WagonToSurface',  'Vagón a superficie'],
  ['PlacingSupport',  'Colocando sostenimiento'],
  ['WagonReturning',  'Vagón de regreso'],
  ['Support',         'Sostenimiento'],
  ['Methane',         'Metano'],
  ['Hazard',          'Riesgo biológico'],
];

const stageLabel = (stage) => {
  if (!stage) return '';
  for (const [prefix, label] of STAGE_PREFIXES) {
    if (stage.startsWith(prefix)) return `${label} ${stage.slice(prefix.length)}`.trim();
  }
  return stage;
};

const CHALLENGES = { reto_reaccion: 'Reto de reacción', reto_memoria: 'Reto de memoria' };

const levelLabel = (key) => {
  if (CHALLENGES[key]) return CHALLENGES[key];
  const n = String(key || '').replace(/\D/g, '');
  return n ? `Nivel ${n}` : (key || '');
};

const failReasonLabel = (r) => (r ? FAIL_REASONS[r] ?? r : '');

module.exports = { FAIL_REASONS, OUTCOMES, BANDS, stageLabel, levelLabel, failReasonLabel };
