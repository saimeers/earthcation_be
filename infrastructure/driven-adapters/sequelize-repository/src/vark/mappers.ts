import { VarkResult, type VarkPlaceFilter, type VarkScores, type VarkStyle } from '@earthcation/model'

// Filas de vark_results (snake_case) ↔ entidad del dominio
export interface VarkRow {
  id: string
  user_id: string
  visual_score: number
  auditory_score: number
  reading_score: number
  dominant_style: VarkStyle
}

export const toVarkResult = (r: VarkRow): VarkResult => VarkResult.restore({
  id: r.id, userId: r.user_id, visual: r.visual_score, auditory: r.auditory_score, reading: r.reading_score,
  dominantStyle: r.dominant_style,
})

export const varkColumns = (userId: string, s: VarkScores) => ({
  user_id: userId, visual_score: s.visual, auditory_score: s.auditory, reading_score: s.reading, dominant_style: s.dominantStyle,
})

/** Solo los campos del filtro que traen valor. */
export const definedOnly = (filter: VarkPlaceFilter): Record<string, string> =>
  Object.fromEntries(Object.entries(filter).filter((e): e is [string, string] => Boolean(e[1])))
