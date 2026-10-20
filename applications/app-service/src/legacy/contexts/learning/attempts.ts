import { groupBy } from '../../shared/collections'

// Porcentajes por intento: cada vez que el jugador entra o reintenta un nivel es un intento nuevo
// (level_attempts), y su % de éxito es el de ESE intento, no la suma de todo su historial. Si en el primer
// intento mitigó 2 de 4 riesgos (50 %) y al reintentar mitigó 4 de 4, su % pasa a 100 % (no 75 %).
//
// Las filas de user_risk_progress sin attempt_id (el juego no pudo abrir el intento, p. ej. sin conexión
// a /api/telemetry) se agrupan por sesión y día como si fueran un intento.
//
// Las filas pueden ser objetos planos o instancias de Sequelize (las usa también session.service.js):
// se leen en plano y se devuelven tal como llegaron.

export type Plain = Readonly<Record<string, unknown>>

type WithGet = { readonly get: (o: { plain: true }) => Plain }
const hasGet = (row: unknown): row is WithGet => typeof (row as Partial<WithGet> | null)?.get === 'function'

export const plainOf = (row: unknown): Plain => (hasGet(row) ? row.get({ plain: true }) : (row as Plain))

const objectOr = (v: unknown): Plain | undefined => (v !== null && typeof v === 'object' ? (v as Plain) : undefined)

const firstPresent = (values: readonly unknown[]): unknown => values.find((v) => v !== undefined && v !== null) ?? null

export const levelOf = (p: Plain): unknown => {
  const risk = objectOr(p.risk) ?? {}
  return firstPresent([risk.level_id, objectOr(risk.level)?.id, p.level_id])
}

const dateOf = (v: unknown): Date | null => (v instanceof Date || typeof v === 'string' ? new Date(v) : null)
const dayOf = (v: unknown): string => dateOf(v)?.toISOString().slice(0, 10) ?? ''
const text = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')

const attemptKey = (p: Plain): string =>
  typeof p.attempt_id === 'string' ? p.attempt_id : `sin-intento:${text(p.session_id)}:${dayOf(p.recorded_at)}`

export type Summary = { readonly total: number; readonly mitigated: number; readonly percentage: number }

/** % de éxito de un conjunto de resultados. */
export const summarize = (rows: readonly unknown[]): Summary => {
  const total = rows.length
  const mitigated = rows.filter((r) => plainOf(r).is_mitigated === true).length
  return { total, mitigated, percentage: total > 0 ? Math.round((mitigated / total) * 100) : 0 }
}

export type Attempt<T> = { readonly key: string; readonly rows: readonly T[]; readonly last_at: Date | null }
export type UserLevel<T> = { readonly user_id: unknown; readonly level_id: unknown; readonly attempts: readonly Attempt<T>[] }

type Entry<T> = { readonly row: T; readonly plain: Plain }

const lastAt = <T>(entries: readonly Entry<T>[]): Date | null => entries.reduce<Date | null>((latest, e) => {
  const at = dateOf(e.plain.recorded_at)
  return at !== null && (latest === null || at > latest) ? at : latest
}, null)

const time = (d: Date | null): number => d?.getTime() ?? 0

// Intentos del más viejo al más reciente
const attemptsOf = <T>(entries: readonly Entry<T>[]): readonly Attempt<T>[] =>
  [...groupBy(entries, (e) => attemptKey(e.plain))]
    .map(([key, group]) => ({ key, rows: group.map((e) => e.row), last_at: lastAt(group) }))
    .toSorted((a, b) => time(a.last_at) - time(b.last_at))

/** Resultados agrupados en intentos por jugador y nivel, en orden de aparición del par jugador|nivel. */
export const groupAttempts = <T>(rows: readonly T[]): readonly UserLevel<T>[] => {
  const entries = rows.map((row) => ({ row, plain: plainOf(row) }))
  return [...groupBy(entries, (e) => `${text(e.plain.user_id)}|${text(levelOf(e.plain))}`).values()]
    .map((group) => ({ user_id: group[0]?.plain.user_id, level_id: levelOf(group[0]?.plain ?? {}), attempts: attemptsOf(group) }))
}

/** Solo las filas del último intento de cada jugador en cada nivel. */
export const latestAttemptRows = <T>(rows: readonly T[]): readonly T[] =>
  groupAttempts(rows).flatMap((ul) => ul.attempts.at(-1)?.rows ?? [])

export type LatestAttempt<T> = Summary & {
  readonly user_id: unknown
  readonly level_id: unknown
  readonly attempts_count: number
  readonly last_at: Date | null
  readonly rows: readonly T[]
}

/** Resumen por nivel del último intento de cada jugador. */
export const latestAttemptByLevel = <T>(rows: readonly T[]): readonly LatestAttempt<T>[] =>
  groupAttempts(rows).map((ul) => {
    const last = ul.attempts.at(-1)
    const lastRows = last?.rows ?? []
    return { user_id: ul.user_id, level_id: ul.level_id, attempts_count: ul.attempts.length, last_at: last?.last_at ?? null, rows: lastRows, ...summarize(lastRows) }
  })
