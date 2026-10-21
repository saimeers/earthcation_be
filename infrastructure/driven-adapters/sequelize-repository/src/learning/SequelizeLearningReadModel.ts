import type { IncludeOptions } from 'sequelize'
import {
  levelProgressOf, summarizeAttempts, summarizeRisks,
  type AttemptFilter, type LearningReadModel, type LearningRow, type SessionFilter,
} from '@earthcation/model'
import type { Models } from '../models'
import { telemetryOverview } from './telemetryOverview'
import { defined, eventCounts, plain, rows, withRiskLevel, type Fields } from './queries'

const DETAIL: (m: Models) => readonly IncludeOptions[] = (m) => [
  { model: m.Level, as: 'level' }, { model: m.User, as: 'user', attributes: ['id', 'username', 'cedula'] },
  { model: m.UserRiskProgress, as: 'riskResults', include: [{ model: m.Risk, as: 'risk' }] },
]

/** Lecturas de progreso, niveles y telemetría para el juego y el panel. */
export class SequelizeLearningReadModel implements LearningReadModel {
  constructor(private readonly models: Models) {}

  levels(): Promise<readonly LearningRow[]> {
    return rows(this.models.Level, { include: [{ association: 'risks' }] })
  }

  async level(id: string): Promise<LearningRow | null> {
    const found = await this.models.Level.findByPk(id, { include: [{ association: 'risks' }] })
    return found ? plain(found) : null
  }

  progress(userId: string, f: SessionFilter): Promise<readonly LearningRow[]> {
    return rows(this.models.UserRiskProgress, {
      where: defined({ user_id: userId, session_id: f.sessionId }), include: [withRiskLevel(this.models)], order: [['recorded_at', 'DESC']],
    })
  }

  async levelProgress(userId: string, levelId: string): Promise<LearningRow> {
    const risks = await this.models.Risk.findAll({ where: { level_id: levelId } })
    const results = await this.models.UserRiskProgress.findAll({
      where: { user_id: userId, risk_id: risks.map((r) => plain(r).id) },
      include: [{ model: this.models.Risk, as: 'risk', attributes: ['level_id'] }],
    })
    return levelProgressOf(levelId, risks, results)
  }

  attempts(userId: string, f: AttemptFilter): Promise<readonly LearningRow[]> {
    return rows(this.models.LevelAttempt, {
      where: defined({ user_id: userId, level_key: f.levelKey, session_id: f.sessionId }),
      include: [{ model: this.models.Level, as: 'level' }], order: [['started_at', 'DESC']],
    })
  }

  async attemptDetail(id: string): Promise<LearningRow | null> {
    const attempt = await this.models.LevelAttempt.findByPk(id, { include: [...DETAIL(this.models)] })
    if (!attempt) return null
    return { attempt: plain(attempt), events: await rows(this.models.GameEvent, { where: { attempt_id: id }, order: [['t_ms', 'ASC'], ['id', 'ASC']] }) }
  }

  async userSummary(userId: string, f: SessionFilter): Promise<LearningRow> {
    const [attemptRows, riskRows, counts] = await this.timeline(userId, f)
    const risks = summarizeRisks(riskRows)
    return {
      user_id: userId, total_attempts: attemptRows.length, levels: summarizeAttempts(attemptRows), risks,
      weakest_risk: risks.find((r) => r.failed > 0) ?? null,
      event_counts: Object.fromEntries(counts.map((e) => [e.event_type, Number(e.count)])),
    }
  }

  telemetryOverview(f: SessionFilter): Promise<LearningRow> {
    return telemetryOverview(this.models, f)
  }

  private timeline(userId: string, f: SessionFilter): Promise<readonly [readonly Fields[], readonly Fields[], readonly Fields[]]> {
    const where = defined({ user_id: userId, session_id: f.sessionId })
    return Promise.all([
      rows(this.models.LevelAttempt, { where, order: [['started_at', 'ASC']] }),
      rows(this.models.UserRiskProgress, { where, include: [withRiskLevel(this.models)], order: [['recorded_at', 'ASC']] }),
      eventCounts(this.models, { user_id: userId }, { sessionId: f.sessionId }),
    ])
  }
}
