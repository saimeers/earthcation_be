import { col, fn, literal, Op, type FindOptions, type Model, type ModelStatic, type WhereOptions } from 'sequelize'
import {
  labelVersions,
  type CityCount, type Count, type LoginStats, type PlaceCount, type VersionCount, type VisitAggregates,
  type VisitStatsReadModel, type VisitTotals,
} from '@earthcation/model'
import type { Models } from '../models'

// Agregaciones para la página Visitas del panel: todo se cuenta en Postgres, aquí solo se da forma.

type Row = Readonly<Record<string, unknown>>
type Where = Readonly<Record<string | symbol, unknown>>
type Table = ModelStatic<Model>
interface Tables { readonly visits: Table; readonly logins: Table; readonly versions: Table }
/** Personas (sin robots), robots e inicios de sesión dentro de la ventana. */
interface Scope { readonly people: Where; readonly bots: Where; readonly logins: Where }

const COUNT = fn('COUNT', col('id'))
const BY_COUNT: FindOptions['order'] = [[literal('count'), 'DESC']]
const DAY = literal(`date_trunc('day', "created_at" AT TIME ZONE 'America/Bogota')`)
// Los tipos de Sequelize no admiten un literal en GROUP BY, aunque Postgres y Sequelize sí
const BY_DAY = [DAY] as unknown as FindOptions['group']

const scopeOf = (since: Date): Scope => {
  const recent = { created_at: { [Op.gte]: since } }
  return { people: { ...recent, is_bot: false }, bots: { ...recent, is_bot: true }, logins: recent }
}

const rows = async (table: Table, options: FindOptions): Promise<readonly Row[]> =>
  (await table.findAll({ ...options, raw: true })) as unknown as Row[]
const present = (where: Where, field: string): WhereOptions => ({ ...where, [field]: { [Op.ne]: null } })
const str = (v: unknown): string => (typeof v === 'string' ? v : String(v))
const dayKey = (d: unknown): string => new Date(str(d)).toISOString().slice(0, 10)
const coord = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))
const numberAt = (row: Row | undefined, key: string): number => Number(row?.[key] ?? 0)
const countWhen = (condition: string) => fn('COUNT', literal(`CASE WHEN ${condition} THEN 1 END`))

const countBy = async (table: Table, where: Where, field: string): Promise<Count[]> =>
  (await rows(table, {
    where: present(where, field), attributes: [[col(field), 'key'], [COUNT, 'count']],
    group: [field], order: BY_COUNT, limit: 12,
  })).map((r) => ({ key: str(r.key), count: Number(r.count) }))

const toPlace = (r: Row): PlaceCount => ({ country: str(r.country), region: str(r.region), count: Number(r.count) })

const regions = async (table: Table, where: Where, limit: number): Promise<PlaceCount[]> =>
  (await rows(table, {
    where: present(where, 'region'), attributes: ['country', 'region', [COUNT, 'count']],
    group: ['country', 'region'], order: BY_COUNT, limit,
  })).map(toPlace)

const cities = async (visits: Table, where: Where): Promise<CityCount[]> =>
  (await rows(visits, {
    where: present(where, 'city'),
    attributes: ['country', 'region', 'city', [COUNT, 'count'], [fn('AVG', col('latitude')), 'lat'], [fn('AVG', col('longitude')), 'lng']],
    group: ['country', 'region', 'city'], order: BY_COUNT, limit: 60,
  })).map((r) => ({ ...toPlace(r), city: str(r.city), lat: coord(r.lat), lng: coord(r.lng) }))

const totals = async (visits: Table, scope: Scope): Promise<VisitTotals> => {
  const [[row], bots] = await Promise.all([rows(visits, { where: scope.people, attributes: [
    [COUNT, 'visits'], [countWhen('is_unique'), 'unique'], [countWhen('session_code IS NOT NULL'), 'via_qr'],
    [fn('COUNT', fn('DISTINCT', col('visitor'))), 'visitors'],
  ] }), visits.count({ where: scope.bots })])
  return { visits: numberAt(row, 'visits'), unique: numberAt(row, 'unique'), viaQr: numberAt(row, 'via_qr'), visitors: numberAt(row, 'visitors'), bots }
}

const visitsPerDay = async (visits: Table, where: Where) =>
  (await rows(visits, {
    where, attributes: [[DAY, 'day'], [COUNT, 'visits'], [countWhen('is_unique'), 'unique']], group: BY_DAY, order: [[DAY, 'ASC']],
  })).map((r) => ({ day: dayKey(r.day), visits: Number(r.visits), unique: Number(r.unique) }))

const versions = async (t: Tables, where: Where): Promise<VersionCount[]> => {
  const counts = await countBy(t.visits, where, 'version_id')
  const found = counts.length ? await rows(t.versions, { where: { id: counts.map((c) => c.key) }, attributes: ['id', 'label'] }) : []
  return labelVersions(counts, new Map(found.map((v) => [str(v.id), str(v.label)])))
}

const loginsByRole = async (logins: Table, where: Where) =>
  (await rows(logins, {
    where, attributes: ['role', [COUNT, 'count'], [fn('COUNT', fn('DISTINCT', col('user_id'))), 'users']], group: ['role'],
  })).map((r) => ({ role: str(r.role), count: Number(r.count), users: Number(r.users) }))

const loginsPerDay = async (logins: Table, where: Where) =>
  (await rows(logins, { where, attributes: [[DAY, 'day'], [COUNT, 'count']], group: BY_DAY, order: [[DAY, 'ASC']] }))
    .map((r) => ({ day: dayKey(r.day), count: Number(r.count) }))

const loginStats = async (logins: Table, where: Where): Promise<LoginStats> => {
  const [byRole, perDay, places, devices] = await Promise.all([
    loginsByRole(logins, where), loginsPerDay(logins, where), regions(logins, where, 20), countBy(logins, where, 'device'),
  ])
  return { byRole, perDay, regions: places, devices }
}

const technology = async (visits: Table, where: Where) => {
  const [countries = [], devices = [], os = [], browsers = []] = await Promise.all(
    ['country', 'device', 'os', 'browser'].map((field) => countBy(visits, where, field)))
  return { countries, devices, os, browsers }
}

export class SequelizeVisitStatsReadModel implements VisitStatsReadModel {
  private readonly tables: Tables

  constructor(models: Models) {
    this.tables = { visits: models.GameVisit, logins: models.LoginEvent, versions: models.GameVersion }
  }

  async aggregate(since: Date): Promise<VisitAggregates> {
    const { visits, logins } = this.tables
    const s = scopeOf(since)
    const [total, perDay, tech, places, cityCounts, byVersion, loginCounts] = await Promise.all([
      totals(visits, s), visitsPerDay(visits, s.people), technology(visits, s.people), regions(visits, s.people, 40),
      cities(visits, s.people), versions(this.tables, s.people), loginStats(logins, s.logins),
    ])
    return { totals: total, perDay, ...tech, regions: places, cities: cityCounts, versions: byVersion, logins: loginCounts }
  }
}
