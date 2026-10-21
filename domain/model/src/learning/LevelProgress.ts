import { latestAttemptByLevel, plainOf, type Plain } from './attempts'

const recordedAt = (p: Plain): number => new Date(p.recorded_at as string).getTime()

const nullable = (o: Plain, keys: readonly string[]): Plain => Object.fromEntries(keys.map((k) => [k, o[k] ?? null]))

const riskProgress = (results: readonly Plain[]) => (r: Plain) => {
  const mine = results.filter((p) => p.risk_id === r.id)
  const last = nullable(mine.toSorted((a, b) => recordedAt(b) - recordedAt(a))[0] ?? {}, ['mistakes_count', 'reaction_time_ms'])
  return {
    risk_id: r.id, risk_name: r.name, category: r.category, mitigated: mine.length > 0 && mine.every((p) => p.is_mitigated === true),
    last_mistakes: last.mistakes_count, last_reaction_ms: last.reaction_time_ms,
  }
}

const NO_ATTEMPT = { mitigated: 0, total: 0, percentage: 0, attempts_count: 0, rows: [] as readonly unknown[] }

/** Progreso del jugador en un nivel (`GET /api/progress/level/:levelId`): solo su último intento. */
export const levelProgressOf = (levelId: string, risks: readonly unknown[], rows: readonly unknown[]) => {
  const latest = latestAttemptByLevel(rows)[0] ?? NO_ATTEMPT
  return {
    level_id: levelId, completion: `${latest.mitigated}/${latest.total}`, percentage: latest.percentage,
    attempts: latest.attempts_count, risks: risks.map(plainOf).map(riskProgress(latest.rows.map(plainOf))),
  }
}
