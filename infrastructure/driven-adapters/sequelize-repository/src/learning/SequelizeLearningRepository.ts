import { Op } from 'sequelize'
import type { CreateAttemptInput, LearningRepository, SaveRiskResultInput } from '@earthcation/model'
import type { Models } from '../models'
import { plain, type Fields } from './queries'

const ownAttempt = (attemptId: unknown, userId: string) => ({ id: attemptId, user_id: userId })

/** Escrituras del juego: resultados por riesgo, intentos de nivel y sus eventos de telemetría. */
export class SequelizeLearningRepository implements LearningRepository {
  constructor(private readonly models: Models) {}

  async riskExists(riskId: unknown): Promise<boolean> {
    return (await this.models.Risk.count({ where: { id: riskId } })) > 0
  }

  async attemptSession(attemptId: unknown, userId: string): Promise<unknown> {
    const attempt = await this.models.LevelAttempt.findOne({ where: ownAttempt(attemptId, userId), attributes: ['session_id'] })
    return attempt ? (plain(attempt).session_id ?? null) : null
  }

  async saveResult(input: SaveRiskResultInput): Promise<Fields> {
    return plain(await this.models.UserRiskProgress.create({
      user_id: input.userId, risk_id: input.riskId, session_id: input.sessionId, attempt_id: input.attemptId,
      is_mitigated: input.isMitigated, mistakes_count: input.mistakesCount, reaction_time_ms: input.reactionTimeMs, detail: input.detail,
    }))
  }

  async abandonOpen(userId: string, levelKey: string, now: Date): Promise<void> {
    await this.models.LevelAttempt.update({ outcome: 'abandoned', ended_at: now }, { where: { user_id: userId, level_key: levelKey, outcome: 'in_progress' } })
  }

  countAttempts(userId: string, levelKey: string): Promise<number> {
    return this.models.LevelAttempt.count({ where: { user_id: userId, level_key: levelKey } })
  }

  async levelIdForNumber(n: string): Promise<unknown> {
    const level = await this.models.Level.findOne({ where: { name: { [Op.iLike]: `Nivel ${n}%` } } })
    return level ? plain(level).id : null
  }

  async createAttempt(input: CreateAttemptInput): Promise<Fields> {
    return plain(await this.models.LevelAttempt.create({
      user_id: input.userId, level_key: input.levelKey, level_id: input.levelId, session_id: input.sessionId,
      attempt_number: input.attemptNumber, vark_style: input.varkStyle, gas_brand: input.gasBrand, game_version: input.gameVersion,
    }))
  }

  async ownsAttempt(attemptId: unknown, userId: string): Promise<boolean> {
    return (await this.models.LevelAttempt.count({ where: ownAttempt(attemptId, userId) })) > 0
  }

  async updateAttempt(attemptId: unknown, patch: Fields): Promise<Fields> {
    await this.models.LevelAttempt.update(patch, { where: { id: attemptId } })
    const updated = await this.models.LevelAttempt.findOne({ where: { id: attemptId } })
    return updated ? plain(updated) : {}
  }

  async saveEvents(events: readonly Fields[]): Promise<void> {
    await this.models.GameEvent.bulkCreate([...events])
  }
}
