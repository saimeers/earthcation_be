import { Op, type WhereOptions } from 'sequelize'
import type { AuditActor, AuditEntry, AuditFilter, AuditLog, AuditOrigin, AuditPage, AuditRecord, AuditWindow } from '@earthcation/model'
import type { Models } from '../models'

interface AuditRow {
  id: string
  occurred_at: Date
  actor_id: string | null
  actor_role: string | null
  action: string
  target_type: string
  target_id: string | null
  changes: Record<string, unknown>
  ip_hash: string | null
  user_agent: string | null
}

const USER_AGENT_MAX = 300

// Filtro del dominio → condiciones de la consulta (solo las que vienen)
const EQUALS = [['actor_id', 'actorId'], ['action', 'action'], ['target_type', 'targetType'], ['target_id', 'targetId']] as const

const bounds = (f: AuditFilter) => ({ ...(f.from && { [Op.gte]: f.from }), ...(f.to && { [Op.lte]: f.to }) })

const rangeOf = (f: AuditFilter) => {
  const b = bounds(f)
  return Reflect.ownKeys(b).length > 0 ? { occurred_at: b } : {}
}

const whereOf = (f: AuditFilter): WhereOptions => ({
  ...Object.fromEntries(EQUALS.filter(([, key]) => f[key]).map(([column, key]) => [column, f[key]])),
  ...rangeOf(f),
})

const actorColumns = (a: AuditActor | undefined) => ({ actor_id: a?.id ?? null, actor_role: a?.role ?? null })

const agentOf = (o: AuditOrigin | null): string | null => o?.userAgent?.slice(0, USER_AGENT_MAX) ?? null

const originColumns = (o: AuditOrigin | null) => ({ ip_hash: o?.ipHash ?? null, user_agent: agentOf(o) })

const rowOf = (e: AuditEntry) => ({
  occurred_at: e.occurredAt, action: e.action, target_type: e.targetType, target_id: e.targetId, changes: e.changes ?? {},
  ...actorColumns(e.actor), ...originColumns(e.origin),
})

const recordOf = (r: AuditRow): AuditRecord => ({
  id: r.id, occurredAt: r.occurred_at, actorId: r.actor_id, actorRole: r.actor_role, action: r.action, targetType: r.target_type,
  targetId: r.target_id, changes: r.changes, ipHash: r.ip_hash, userAgent: r.user_agent,
})

export class SequelizeAuditLog implements AuditLog {
  constructor(private readonly models: Models) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.models.AuditLog.create(rowOf(entry))
  }

  async list(filter: AuditFilter, window: AuditWindow): Promise<AuditPage> {
    const { rows, count } = await this.models.AuditLog.findAndCountAll({
      where: whereOf(filter), order: [['occurred_at', 'DESC'], ['id', 'DESC']], offset: window.offset, limit: window.limit, raw: true,
    })
    return { rows: (rows as unknown as AuditRow[]).map(recordOf), total: count }
  }
}
