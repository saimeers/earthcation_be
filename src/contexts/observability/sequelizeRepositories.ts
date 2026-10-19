import { col, fn, literal, Op, type FindOptions, type Model, type ModelStatic, type WhereOptions } from 'sequelize'
import models from '../../models'
import {
  labelVersions,
  type CityCount, type Count, type LoginEvent, type LoginStats, type PlaceCount, type Visit, type VisitAggregates, type VisitTotals,
} from './domain'
import type { VisitRepository, VisitStatsReadModel } from './ports'

const visitRow = (v: Visit) => ({
  visitor: v.visitor, is_unique: v.isUnique, version_id: v.versionId, country: v.country, region: v.region,
  city: v.city, colo: v.colo, latitude: v.latitude, longitude: v.longitude, session_code: v.sessionCode,
  asn: v.asn, as_org: v.asOrg, is_bot: v.isBot, device: v.device, os: v.os, browser: v.browser,
})
const loginRow = (e: LoginEvent) => ({
  user_id: e.userId, role: e.role, country: e.country, region: e.region, city: e.city,
  device: e.device, os: e.os, browser: e.browser,
})

export const visitRepository: VisitRepository = {
  saveVisit: async (v) => { await models.GameVisit.create(visitRow(v)) },
  saveLogin: async (e) => { await models.LoginEvent.create(loginRow(e)) },
}

// ── Agregaciones para el panel ────────────────────────────────────────────────

type Row = Readonly<Record<string, unknown>>
type Where = Readonly<Record<string | symbol, unknown>>
type Table = ModelStatic<Model>
type Scope = { readonly people: Where; readonly bots: Where; readonly logins: Where }

const COUNT = fn('COUNT', col('id'))
const BY_COUNT: FindOptions['order'] = [[literal('count'), 'DESC']]
const DAY = literal(`date_trunc('day', "created_at" AT TIME ZONE 'America/Bogota')`)
// Los tipos de Sequelize no admiten un literal en GROUP BY, aunque Postgres y Sequelize sí
const BY_DAY = [DAY] as unknown as FindOptions['group']
const VISITS: Table = models.GameVisit
const LOGINS: Table = models.LoginEvent

const scopeOf = (since: Date): Scope => {
  const recent = { created_at: { [Op.gte]: since } }
  return { people: { ...recent, is_bot: false }, bots: { ...recent, is_bot: true }, logins: recent }
}

const rows = async (table: Table, options: FindOptions): Promise<readonly Row[]> =>
  (await table.findAll({ ...options, raw: true })) as unknown as Row[]
const present = (where: Where, field: string): WhereOptions => ({ ...where, [field]: { [Op.ne]: null } })
const str = (v: unknown): string => (typeof v === 'string' ? v : String(v))
const dayKey = (d: unknown): string => new Date(str(d)).toISOString().slice(0, 10)
const coord = (v: unknown): number | null => (v == null ? null : Number(v))

const countBy = async (table: Table, where: Where, field: string): Promise<readonly Count[]> =>
  (await rows(table, {
    where: present(where, field), attributes: [[col(field), 'key'], [COUNT, 'count']],
    group: [field], order: BY_COUNT, limit: 12,
  })).map((r) => ({ key: str(r.key), count: Number(r.count) }))

const toPlace = (r: Row): PlaceCount => ({ country: str(r.country), region: str(r.region), count: Number(r.count) })

const regions = async (table: Table, where: Where, limit: number): Promise<readonly PlaceCount[]> =>
  (await rows(table, {
    where: present(where, 'region'), attributes: ['country', 'region', [COUNT, 'count']],
    group: ['country', 'region'], order: BY_COUNT, limit,
  })).map(toPlace)

const cities = async (where: Where): Promise<readonly CityCount[]> =>
  (await rows(VISITS, {
    where: present(where, 'city'),
    attributes: ['country', 'region', 'city', [COUNT, 'count'], [fn('AVG', col('latitude')), 'lat'], [fn('AVG', col('longitude')), 'lng']],
    group: ['country', 'region', 'city'], order: BY_COUNT, limit: 60,
  })).map((r) => ({ ...toPlace(r), city: str(r.city), lat: coord(r.lat), lng: coord(r.lng) }))

const numberAt = (row: Row | undefined, key: string): number => Number(row?.[key] ?? 0)

const countWhen = (condition: string) => fn('COUNT', literal(`CASE WHEN ${condition} THEN 1 END`))

const totals = async (scope: Scope): Promise<VisitTotals> => {
  const [[row], bots] = await Promise.all([rows(VISITS, { where: scope.people, attributes: [
    [COUNT, 'visits'], [countWhen('is_unique'), 'unique'], [countWhen('session_code IS NOT NULL'), 'via_qr'],
    [fn('COUNT', fn('DISTINCT', col('visitor'))), 'visitors'],
  ] }), VISITS.count({ where: scope.bots })])
  return { visits: numberAt(row, 'visits'), unique: numberAt(row, 'unique'), viaQr: numberAt(row, 'via_qr'), visitors: numberAt(row, 'visitors'), bots }
}

const visitsPerDay = async (where: Where) =>
  (await rows(VISITS, {
    where, attributes: [[DAY, 'day'], [COUNT, 'visits'], [countWhen('is_unique'), 'unique']], group: BY_DAY, order: [[DAY, 'ASC']],
  })).map((r) => ({ day: dayKey(r.day), visits: Number(r.visits), unique: Number(r.unique) }))

const versions = async (where: Where) => {
  const counts = await countBy(VISITS, where, 'version_id')
  const found = counts.length ? await rows(models.GameVersion, { where: { id: counts.map((c) => c.key) }, attributes: ['id', 'label'] }) : []
  return labelVersions(counts, new Map(found.map((v) => [str(v.id), str(v.label)])))
}

const loginsByRole = async (where: Where) =>
  (await rows(LOGINS, {
    where, attributes: ['role', [COUNT, 'count'], [fn('COUNT', fn('DISTINCT', col('user_id'))), 'users']], group: ['role'],
  })).map((r) => ({ role: str(r.role), count: Number(r.count), users: Number(r.users) }))

const loginsPerDay = async (where: Where) =>
  (await rows(LOGINS, { where, attributes: [[DAY, 'day'], [COUNT, 'count']], group: BY_DAY, order: [[DAY, 'ASC']] }))
    .map((r) => ({ day: dayKey(r.day), count: Number(r.count) }))

const logins = async (where: Where): Promise<LoginStats> => {
  const [byRole, perDay, places, devices] = await Promise.all([
    loginsByRole(where), loginsPerDay(where), regions(LOGINS, where, 20), countBy(LOGINS, where, 'device'),
  ])
  return { byRole, perDay, regions: places, devices }
}

const technology = async (where: Where) => {
  const [countries, devices, os, browsers] = await Promise.all(
    ['country', 'device', 'os', 'browser'].map((field) => countBy(VISITS, where, field)))
  return { countries: countries ?? [], devices: devices ?? [], os: os ?? [], browsers: browsers ?? [] }
}

const aggregate = async (since: Date): Promise<VisitAggregates> => {
  const s = scopeOf(since)
  const [total, perDay, tech, places, cityCounts, byVersion, loginStats] = await Promise.all([
    totals(s), visitsPerDay(s.people), technology(s.people), regions(VISITS, s.people, 40), cities(s.people), versions(s.people), logins(s.logins),
  ])
  return { totals: total, perDay, ...tech, regions: places, cities: cityCounts, versions: byVersion, logins: loginStats }
}

export const visitStatsReadModel: VisitStatsReadModel = { aggregate }
