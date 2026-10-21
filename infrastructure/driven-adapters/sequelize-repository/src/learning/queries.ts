import { col, fn, literal, type FindOptions, type IncludeOptions, type Model, type ModelStatic, type WhereOptions } from 'sequelize'
import type { Models } from '../models'

// Piezas comunes de las consultas de aprendizaje (escrituras, lecturas del panel y analítica)

export type Fields = Readonly<Record<string, unknown>>
export type Table = ModelStatic<Model>

export const plain = (m: Model): Fields => m.get({ plain: true }) as Fields

export const rows = async (table: Table, options: FindOptions): Promise<readonly Fields[]> => (await table.findAll(options)).map(plain)

export const raw = async (table: Table, options: FindOptions): Promise<readonly Fields[]> =>
  (await table.findAll({ ...options, raw: true })) as unknown as Fields[]

/** Solo los filtros con valor (los de la query que no vinieron quedan fuera). */
export const defined = (o: Fields): WhereOptions =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''))

export const COUNT = fn('COUNT', col('id'))
export const BY_COUNT: FindOptions['order'] = [[literal('count'), 'DESC']]
export const sumWhen = (condition: string) => fn('SUM', literal(`CASE WHEN ${condition} THEN 1 ELSE 0 END`))

export const withRiskLevel = (m: Models): IncludeOptions => ({ model: m.Risk, as: 'risk', include: [{ model: m.Level, as: 'level' }] })

// Eventos de los intentos de una sala (sin sala, todos)
const inSession = (m: Models, sessionId?: string): IncludeOptions[] =>
  sessionId ? [{ model: m.LevelAttempt, as: 'attempt', attributes: [], where: { session_id: sessionId } }] : []

export type EventCountsOptions = { readonly sessionId?: string; readonly ordered?: boolean }

export const eventCounts = (m: Models, where: Fields, options: EventCountsOptions = {}): Promise<readonly Fields[]> => raw(m.GameEvent, {
  where, attributes: ['event_type', [fn('COUNT', col('GameEvent.id')), 'count']], include: inSession(m, options.sessionId), group: ['event_type'],
  ...(options.ordered ? { order: BY_COUNT } : {}),
})
