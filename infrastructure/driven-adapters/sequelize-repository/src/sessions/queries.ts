import { col, fn, type IncludeOptions, type Model } from 'sequelize'
import type { SessionRow } from '@earthcation/model'
import type { Models } from '../models'

export const plain = (m: Model): SessionRow => m.get({ plain: true }) as SessionRow
export const plainOrNull = (m: Model | null): SessionRow | null => (m ? plain(m) : null)
export const rows = async (p: Promise<readonly Model[]>): Promise<readonly SessionRow[]> => (await p).map(plain)

export const withRiskLevel = (m: Models): IncludeOptions => ({ model: m.Risk, as: 'risk', include: [{ model: m.Level, as: 'level' }] })

export const ofSession = (m: Models, id: string): IncludeOptions => ({ model: m.LevelAttempt, as: 'attempt', attributes: [], where: { session_id: id } })

export const EVENT_COUNT = fn('COUNT', col('GameEvent.id'))
