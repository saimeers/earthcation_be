import { latestAttemptByLevel, summarize, sum, type SessionRow } from '@earthcation/model'

type Fields = Readonly<Record<string, unknown>>

const obj = (v: unknown): Fields => (v !== null && typeof v === 'object' ? (v as Fields) : {})
const styleOf = (su: Fields): unknown => obj(obj(su.user).varkProfile).dominant_style || null

// % del último intento de cada nivel dentro de la sesión (reintentar reemplaza, no promedia)
const latestScores = (mine: readonly Fields[]) => {
  const latest = latestAttemptByLevel(mine)
  const latestRows = latest.flatMap((l) => l.rows)
  const { total, mitigated, percentage } = summarize(latestRows)
  // v1: el promedio cuenta como 0 las reacciones sin dato, y un promedio 0 sale como null
  const avgTime = total > 0 ? sum(latestRows.map((p) => Number(p.reaction_time_ms ?? 0) || 0)) / total : 0
  return { total_attempts: total, mitigated, percentage, level_attempts: sum(latest.map((l) => l.attempts_count)), avg_reaction_ms: avgTime ? Math.round(avgTime) : null }
}

/** Fila de progreso de un participante (lo que ve el instructor en el detalle simple, sin caché). */
export const roomProgressRow = (results: readonly Fields[]) => (su: Fields): SessionRow => {
  const mine = results.filter((r) => r.user_id === su.user_id)
  return { user: su.user, dominant_style: styleOf(su), ...latestScores(mine), progress: mine }
}
