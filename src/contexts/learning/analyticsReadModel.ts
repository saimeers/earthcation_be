import { col, fn, literal, Op } from 'sequelize'
import models from '../../models'
import { groupBy, maxBy } from '../../shared/collections'
import { latestAttemptByLevel, latestAttemptRows, plainOf, summarize } from './attempts'
import { coordsFor } from './geo'
import { hardestRisks, levelProgress, playerSummary } from './summaries'
import { raw, RESULTS, rows, sumWhen, type Fields } from './queries'
import type { AnalyticsReadModel, PlaceFilter } from './ports'

// Analítica del panel. Todos los % de éxito usan el ÚLTIMO intento de cada jugador en cada nivel (attempts.ts):
// reintentar no promedia con lo anterior, reemplaza.

const RESULT_ATTRS = ['id', 'user_id', 'risk_id', 'attempt_id', 'session_id', 'is_mitigated', 'mistakes_count', 'reaction_time_ms', 'recorded_at']
const results = (where: Fields = {}) => rows(RESULTS, {
  where, attributes: RESULT_ATTRS, include: [{ model: models.Risk, as: 'risk', attributes: ['level_id', 'name', 'category'] }],
})

const anyOf = (ids: readonly unknown[]) => ({ [Op.in]: [...ids] })

// ── Resumen global ────────────────────────────────────────────────────────────

const counts = async () => {
  const [total, players, instructors, sessions, active] = await Promise.all([
    models.User.count(), models.User.count({ where: { role: 'player' } }), models.User.count({ where: { role: 'instructor' } }),
    models.TrainingSession.count(), models.TrainingSession.count({ where: { status: 'active' } }),
  ])
  return { users: { total, players, instructors }, sessions: { total: sessions, active } }
}

const levelList = () => rows(models.Level, { attributes: ['id', 'name'], order: [['id', 'ASC']] })

const varkDistribution = async () => (await raw(models.VarkResult, {
  attributes: ['dominant_style', [fn('COUNT', col('id')), 'count']], group: ['dominant_style'],
})).map((v) => ({ style: v.dominant_style ?? 'Sin completar', count: Number(v.count) }))

const WEEK = literal("date_trunc('week', recorded_at)")

// Mitigaciones por semana, últimas 8 semanas con datos (con todo el historial)
const weeklyTrend = async () => (await raw(RESULTS, {
  attributes: [[fn('date_trunc', 'week', col('recorded_at')), 'week'], [fn('COUNT', col('UserRiskProgress.id')), 'total'], [sumWhen('is_mitigated'), 'mitigated']],
  group: [WEEK as unknown as string], order: [[WEEK, 'ASC']],
})).slice(-8).map((r) => {
  const total = Number(r.total)
  const mitigated = Number(r.mitigated)
  return { week: r.week, total, mitigated, percentage: total > 0 ? Math.round((mitigated / total) * 100) : 0 }
})

const progressOf = (allRows: readonly Fields[], latest: ReturnType<typeof latestAttemptByLevel<Fields>>) => {
  const s = summarize(latest.flatMap((l) => l.rows))
  return {
    total_attempts: s.total, // resultados del último intento de cada jugador por nivel
    total_mitigated: s.mitigated, global_percentage: s.percentage,
    history_results: allRows.length, // todos los resultados, con reintentos
    level_attempts: latest.reduce((a, l) => a + l.attempts_count, 0),
  }
}

const overview = async (): Promise<Fields> => {
  const [totals, allRows, vark, levels, trend] = await Promise.all([counts(), results(), varkDistribution(), levelList(), weeklyTrend()])
  const latest = latestAttemptByLevel(allRows)
  return {
    ...totals, progress: progressOf(allRows, latest), vark_distribution: vark,
    progress_by_level: levels.map((l) => levelProgress({ id: l.id, name: l.name }, latest)),
    riesgos_mas_fallados: hardestRisks(allRows), tendencia_temporal: trend,
  }
}

// ── Por jugador (organización, localidad) ─────────────────────────────────────

const USER_ATTRS = ['id', 'first_name', 'last_name', 'cedula']

// Resumen de muchos jugadores con 2 consultas (antes eran 2 por jugador)
const summariesByUser = async (userIds: readonly unknown[]) => {
  const [resultRows, varks] = await Promise.all([
    results({ user_id: anyOf(userIds) }), raw(models.VarkResult, { where: { user_id: anyOf(userIds) }, attributes: ['user_id', 'dominant_style'] }),
  ])
  const byUser = groupBy(resultRows, (r) => r.user_id)
  const style = new Map(varks.map((v) => [v.user_id, v.dominant_style]))
  return (userId: unknown) => ({ dominant_style: style.get(userId) ?? null, ...playerSummary(latestAttemptByLevel(byUser.get(userId) ?? [])) })
}

const withSummaries = async (profiles: readonly Fields[], pick: (p: Fields) => Fields) => {
  if (profiles.length === 0) return []
  const summaryOf = await summariesByUser(profiles.map((p) => p.user_id))
  return profiles.map((p) => ({ ...pick(p), ...summaryOf(p.user_id) }))
}

const byOrganization = async (organizationId: string) => withSummaries(await rows(models.UserProfile, {
  where: { organization_id: organizationId }, include: [{ model: models.User, as: 'user', attributes: USER_ATTRS }],
}), (p) => ({ user: p.user }))

const locationIds = async (f: PlaceFilter) =>
  (await raw(models.Location, { where: Object.fromEntries(Object.entries(f).filter(([, v]) => Boolean(v))), attributes: ['id'] })).map((l) => l.id)

const byLocation = async (f: PlaceFilter) => {
  const ids = await locationIds(f)
  return ids.length === 0 ? [] : withSummaries(await rows(models.UserProfile, {
    where: { location_id: anyOf(ids) },
    include: [{ model: models.User, as: 'user', attributes: USER_ATTRS }, { model: models.Location, as: 'location', attributes: ['municipality', 'department'] }],
  }), (p) => ({ user: p.user, location: p.location }))
}

// ── Mapa de unidades mineras ──────────────────────────────────────────────────

type Place = { readonly municipality: string; readonly department: string }

const placeOf = (p: Fields): Place | null => {
  const l = p.location as Fields | null
  return l && typeof l.municipality === 'string' && typeof l.department === 'string'
    ? { municipality: l.municipality, department: l.department } : null
}

// Organization no tiene ubicación propia: se infiere como el municipio más frecuente entre sus jugadores
const topPlace = (profiles: readonly Fields[]): Place | null => {
  const places = profiles.map(placeOf).filter((x): x is Place => x !== null)
  const groups = [...groupBy(places, (x) => `${x.municipality}|${x.department}`).values()]
  return maxBy(groups, (g) => g.length)?.[0] ?? null
}

const NOWHERE = { municipality: null, department: null, lat: null, lng: null, location_exact: false }

// location_exact false: el municipio no está en DIVIPOLA y se ubicó en la capital del departamento
const coordsOf = (place: Place) => {
  const c = coordsFor(place.municipality, place.department)
  return c ? { lat: c.lat, lng: c.lng, location_exact: c.exact } : { lat: null, lng: null, location_exact: false }
}

const whereIs = (place: Place | null) => (place === null ? NOWHERE : { ...place, ...coordsOf(place) })

const mine = (profiles: readonly Fields[], latest: readonly unknown[]) => (org: Fields) => {
  const mineProfiles = profiles.filter((p) => p.organization_id === org.id)
  const members = new Set(mineProfiles.map((p) => p.user_id))
  const s = summarize(latest.filter((r) => members.has(plainOf(r).user_id)))
  return { id: org.id, name: org.name, ...whereIs(topPlace(mineProfiles)), player_count: mineProfiles.length, results: s.total, percentage: s.percentage }
}

const minesMap = async () => {
  const organizations = await rows(models.Organization, { where: { is_active: true } })
  if (organizations.length === 0) return []
  const profiles = await rows(models.UserProfile, {
    where: { organization_id: anyOf(organizations.map((o) => o.id)) },
    include: [{ model: models.User, as: 'user', attributes: ['id'], where: { is_active: true } }, { model: models.Location, as: 'location', attributes: ['municipality', 'department'] }],
  })
  const latest = latestAttemptRows(await results({ user_id: anyOf(profiles.map((p) => p.user_id)) }))
  return organizations.map(mine(profiles, latest)).filter((o) => o.department !== null)
}

export const analyticsReadModel: AnalyticsReadModel = { overview, byOrganization, byLocation, minesMap }
