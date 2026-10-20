import { Op, type IncludeOptions } from 'sequelize'
import models from '../../models'
import { levelProgressOf } from './domain'
import { summarizeAttempts, summarizeRisks } from './summaries'
import { telemetryOverview } from './telemetryOverview'
import { ATTEMPTS, defined, EVENTS, eventCounts, plain, RESULTS, rows, withRiskLevel, type Fields } from './queries'
import type { AttemptFilter, LearningReadModel, LearningRepository, SessionFilter } from './ports'

// ── Escrituras del juego ──────────────────────────────────────────────────────

const ownAttempt = (attemptId: unknown, userId: string) => ({ id: attemptId, user_id: userId })

const attemptSession = async (attemptId: unknown, userId: string): Promise<unknown> => {
  const attempt = await ATTEMPTS.findOne({ where: ownAttempt(attemptId, userId), attributes: ['session_id'] })
  return attempt ? (plain(attempt).session_id ?? null) : null
}

const levelIdForNumber = async (n: string): Promise<unknown> => {
  const level = await models.Level.findOne({ where: { name: { [Op.iLike]: `Nivel ${n}%` } } })
  return level ? plain(level).id : null
}

const updateAttempt = async (attemptId: unknown, patch: Fields): Promise<Fields> => {
  await ATTEMPTS.update(patch, { where: { id: attemptId } })
  const updated = await ATTEMPTS.findOne({ where: { id: attemptId } })
  return updated ? plain(updated) : {}
}

export const learningRepository: LearningRepository = {
  attemptSession, levelIdForNumber, updateAttempt,
  riskExists: async (riskId) => (await models.Risk.count({ where: { id: riskId } })) > 0,
  saveResult: async (row) => plain(await RESULTS.create(row)),
  abandonOpen: async (userId, levelKey, now) => {
    await ATTEMPTS.update({ outcome: 'abandoned', ended_at: now }, { where: { user_id: userId, level_key: levelKey, outcome: 'in_progress' } })
  },
  countAttempts: (userId, levelKey) => ATTEMPTS.count({ where: { user_id: userId, level_key: levelKey } }),
  createAttempt: async (row) => plain(await ATTEMPTS.create(row)),
  ownsAttempt: async (attemptId, userId) => (await ATTEMPTS.count({ where: ownAttempt(attemptId, userId) })) > 0,
  saveEvents: async (events) => { await EVENTS.bulkCreate([...events]) },
}

// ── Lecturas ──────────────────────────────────────────────────────────────────

const progress = (userId: string, f: SessionFilter) =>
  rows(RESULTS, { where: defined({ user_id: userId, session_id: f.sessionId }), include: [withRiskLevel], order: [['recorded_at', 'DESC']] })

const levelProgress = async (userId: string, levelId: string): Promise<Fields> => {
  const risks = await models.Risk.findAll({ where: { level_id: levelId } })
  const results = await RESULTS.findAll({
    where: { user_id: userId, risk_id: risks.map((r) => plain(r).id) },
    include: [{ model: models.Risk, as: 'risk', attributes: ['level_id'] }],
  })
  return levelProgressOf(levelId, risks, results)
}

const attempts = (userId: string, f: AttemptFilter) => rows(ATTEMPTS, {
  where: defined({ user_id: userId, level_key: f.levelKey, session_id: f.sessionId }),
  include: [{ model: models.Level, as: 'level' }], order: [['started_at', 'DESC']],
})

const DETAIL: IncludeOptions[] = [
  { model: models.Level, as: 'level' }, { model: models.User, as: 'user', attributes: ['id', 'username', 'cedula'] },
  { model: RESULTS, as: 'riskResults', include: [{ model: models.Risk, as: 'risk' }] },
]

const attemptDetail = async (id: string): Promise<Fields | null> => {
  const attempt = await ATTEMPTS.findByPk(id, { include: DETAIL })
  if (!attempt) return null
  return { attempt: plain(attempt), events: await rows(EVENTS, { where: { attempt_id: id }, order: [['t_ms', 'ASC'], ['id', 'ASC']] }) }
}

const timeline = (userId: string, f: SessionFilter) => {
  const where = defined({ user_id: userId, session_id: f.sessionId })
  return Promise.all([
    ATTEMPTS.findAll({ where, order: [['started_at', 'ASC']] }),
    RESULTS.findAll({ where, include: [withRiskLevel], order: [['recorded_at', 'ASC']] }),
    eventCounts({ user_id: userId }, f.sessionId),
  ])
}

// Trazabilidad de un jugador: por nivel, por riesgo y dónde se equivoca (con sala, solo lo de esa sala)
const userSummary = async (userId: string, f: SessionFilter): Promise<Fields> => {
  const [attemptRows, riskRows, counts] = await timeline(userId, f)
  const risks = summarizeRisks(riskRows)
  return {
    user_id: userId, total_attempts: attemptRows.length, levels: summarizeAttempts(attemptRows), risks,
    weakest_risk: risks.find((r) => r.failed > 0) ?? null,
    event_counts: Object.fromEntries(counts.map((e) => [e.event_type, Number(e.count)])),
  }
}

const level = async (id: string): Promise<Fields | null> => {
  const found = await models.Level.findByPk(id, { include: [{ association: 'risks' }] })
  return found ? plain(found) : null
}

export const learningReadModel: LearningReadModel = {
  levels: () => rows(models.Level, { include: [{ association: 'risks' }] }),
  level, progress, levelProgress, attempts, attemptDetail, userSummary, telemetryOverview,
}
