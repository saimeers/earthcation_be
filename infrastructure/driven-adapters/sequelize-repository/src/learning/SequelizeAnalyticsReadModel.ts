import { col, fn, literal, Op } from 'sequelize'
import {
  groupBy, hardestRisks, latestAttemptByLevel, latestAttemptRows, levelProgress, maxBy, plainOf, playerSummary, summarize,
  type AnalyticsReadModel, type LearningRow, type MunicipalityCoordinates, type PlaceFilter,
} from '@earthcation/model'
import type { Models } from '../models'
import { raw, rows, sumWhen, type Fields } from './queries'

// Analítica del panel. Todos los % de éxito usan el ÚLTIMO intento de cada jugador en cada nivel (attempts.ts):
// reintentar no promedia con lo anterior, reemplaza.

const RESULT_ATTRS = ['id', 'user_id', 'risk_id', 'attempt_id', 'session_id', 'is_mitigated', 'mistakes_count', 'reaction_time_ms', 'recorded_at']

const anyOf = (ids: readonly unknown[]) => ({ [Op.in]: [...ids] })

const USER_ATTRS = ['id', 'first_name', 'last_name', 'cedula']
const WEEK = literal("date_trunc('week', recorded_at)")

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

/** Analítica del panel: resumen global, por organización, por localidad y mapa de minas. */
export class SequelizeAnalyticsReadModel implements AnalyticsReadModel {
  constructor(private readonly models: Models, private readonly coordinates: MunicipalityCoordinates) {}

  async overview(): Promise<LearningRow> {
    const [totals, allRows, vark, levels, trend] = await Promise.all([
      this.counts(), this.results(), this.varkDistribution(), this.levelList(), this.weeklyTrend(),
    ])
    return this.overviewOf({ totals, allRows, vark, levels, trend })
  }

  private overviewOf(parts: { readonly totals: Fields; readonly allRows: readonly Fields[]; readonly vark: unknown; readonly levels: readonly Fields[]; readonly trend: unknown }): LearningRow {
    const latest = latestAttemptByLevel(parts.allRows)
    return {
      ...parts.totals, progress: this.progressOf(parts.allRows, latest), vark_distribution: parts.vark,
      progress_by_level: parts.levels.map((l) => levelProgress({ id: l.id, name: l.name }, latest)),
      riesgos_mas_fallados: hardestRisks(parts.allRows), tendencia_temporal: parts.trend,
    }
  }

  async byOrganization(organizationId: string): Promise<readonly LearningRow[]> {
    const profiles = await rows(this.models.UserProfile, {
      where: { organization_id: organizationId }, include: [{ model: this.models.User, as: 'user', attributes: USER_ATTRS }],
    })
    return this.withSummaries(profiles, (p) => ({ user: p.user }))
  }

  async byLocation(f: PlaceFilter): Promise<readonly LearningRow[]> {
    const ids = await this.locationIds(f)
    if (ids.length === 0) return []
    const profiles = await rows(this.models.UserProfile, {
      where: { location_id: anyOf(ids) },
      include: [{ model: this.models.User, as: 'user', attributes: USER_ATTRS }, { model: this.models.Location, as: 'location', attributes: ['municipality', 'department'] }],
    })
    return this.withSummaries(profiles, (p) => ({ user: p.user, location: p.location }))
  }

  async minesMap(): Promise<readonly LearningRow[]> {
    const organizations = await rows(this.models.Organization, { where: { is_active: true } })
    if (organizations.length === 0) return []
    const profiles = await rows(this.models.UserProfile, {
      where: { organization_id: anyOf(organizations.map((o) => o.id)) },
      include: [{ model: this.models.User, as: 'user', attributes: ['id'], where: { is_active: true } }, { model: this.models.Location, as: 'location', attributes: ['municipality', 'department'] }],
    })
    const latest = latestAttemptRows(await this.results({ user_id: anyOf(profiles.map((p) => p.user_id)) }))
    return organizations.map(this.mine(profiles, latest)).filter((o) => o.department !== null)
  }

  private results(where: Fields = {}): Promise<readonly Fields[]> {
    return rows(this.models.UserRiskProgress, { where, attributes: RESULT_ATTRS, include: [{ model: this.models.Risk, as: 'risk', attributes: ['level_id', 'name', 'category'] }] })
  }

  private async counts() {
    const [total, players, instructors, sessions, active] = await Promise.all([
      this.models.User.count(), this.models.User.count({ where: { role: 'player' } }), this.models.User.count({ where: { role: 'instructor' } }),
      this.models.TrainingSession.count(), this.models.TrainingSession.count({ where: { status: 'active' } }),
    ])
    return { users: { total, players, instructors }, sessions: { total: sessions, active } }
  }

  private levelList() {
    return rows(this.models.Level, { attributes: ['id', 'name'], order: [['id', 'ASC']] })
  }

  private async varkDistribution() {
    return (await raw(this.models.VarkResult, {
      attributes: ['dominant_style', [fn('COUNT', col('id')), 'count']], group: ['dominant_style'],
    })).map((v) => ({ style: v.dominant_style ?? 'Sin completar', count: Number(v.count) }))
  }

  // Mitigaciones por semana, últimas 8 semanas con datos (con todo el historial)
  private async weeklyTrend() {
    return (await raw(this.models.UserRiskProgress, {
      attributes: [[fn('date_trunc', 'week', col('recorded_at')), 'week'], [fn('COUNT', col('UserRiskProgress.id')), 'total'], [sumWhen('is_mitigated'), 'mitigated']],
      group: [WEEK as unknown as string], order: [[WEEK, 'ASC']],
    })).slice(-8).map((r) => {
      const total = Number(r.total)
      const mitigated = Number(r.mitigated)
      return { week: r.week, total, mitigated, percentage: total > 0 ? Math.round((mitigated / total) * 100) : 0 }
    })
  }

  private progressOf(allRows: readonly Fields[], latest: ReturnType<typeof latestAttemptByLevel<Fields>>) {
    const s = summarize(latest.flatMap((l) => l.rows))
    return {
      total_attempts: s.total, total_mitigated: s.mitigated, global_percentage: s.percentage,
      history_results: allRows.length, level_attempts: latest.reduce((a, l) => a + l.attempts_count, 0),
    }
  }

  // Resumen de muchos jugadores con 2 consultas (antes eran 2 por jugador)
  private async summariesByUser(userIds: readonly unknown[]) {
    const [resultRows, varks] = await Promise.all([
      this.results({ user_id: anyOf(userIds) }), raw(this.models.VarkResult, { where: { user_id: anyOf(userIds) }, attributes: ['user_id', 'dominant_style'] }),
    ])
    const byUser = groupBy(resultRows, (r) => r.user_id)
    const style = new Map(varks.map((v) => [v.user_id, v.dominant_style]))
    return (userId: unknown) => ({ dominant_style: style.get(userId) ?? null, ...playerSummary(latestAttemptByLevel(byUser.get(userId) ?? [])) })
  }

  private async withSummaries(profiles: readonly Fields[], pick: (p: Fields) => Fields): Promise<readonly LearningRow[]> {
    if (profiles.length === 0) return []
    const summaryOf = await this.summariesByUser(profiles.map((p) => p.user_id))
    return profiles.map((p) => ({ ...pick(p), ...summaryOf(p.user_id) }))
  }

  private async locationIds(f: PlaceFilter): Promise<readonly unknown[]> {
    return (await raw(this.models.Location, { where: Object.fromEntries(Object.entries(f).filter(([, v]) => Boolean(v))), attributes: ['id'] })).map((l) => l.id)
  }

  // location_exact false: el municipio no está en DIVIPOLA y se ubicó en la capital del departamento
  private whereIs(place: Place | null) {
    if (place === null) return NOWHERE
    const c = this.coordinates.locate(place.municipality, place.department)
    return { ...place, ...(c ? { lat: c.lat, lng: c.lng, location_exact: c.exact } : { lat: null, lng: null, location_exact: false }) }
  }

  private mine(profiles: readonly Fields[], latest: readonly unknown[]) {
    return (org: Fields) => {
      const mineProfiles = profiles.filter((p) => p.organization_id === org.id)
      const members = new Set(mineProfiles.map((p) => p.user_id))
      const s = summarize(latest.filter((r) => members.has(plainOf(r).user_id)))
      return { id: org.id, name: org.name, ...this.whereIs(topPlace(mineProfiles)), player_count: mineProfiles.length, results: s.total, percentage: s.percentage }
    }
  }
}
