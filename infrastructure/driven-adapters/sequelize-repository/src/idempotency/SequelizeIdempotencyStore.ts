import { QueryTypes, type Sequelize } from 'sequelize'
import type { ClaimResult, IdempotencyClaim, IdempotencyStore, StoredReply } from '@earthcation/model'

/** La clave se recuerda un día: más que cualquier reintento de red. */
const TTL_MS = 24 * 60 * 60 * 1000
/** Una petición "en curso" que lleva más de esto se da por abandonada (el proceso murió) y otra puede tomarla. */
const STALE_MS = 2 * 60 * 1000

interface SavedRow {
  readonly fingerprint: string
  readonly status_code: number | null
  readonly response: { readonly data: unknown, readonly location?: string } | null
}

export class SequelizeIdempotencyStore implements IdempotencyStore {
  constructor(private readonly sequelize: Sequelize, private readonly now: () => Date) {}

  async claim(c: IdempotencyClaim): Promise<ClaimResult> {
    if (await this.insert(c)) return { kind: 'new' }
    return this.inspect(c)
  }

  async complete(c: IdempotencyClaim, reply: StoredReply): Promise<void> {
    const response = JSON.stringify({ data: reply.data, location: reply.location })
    await this.run('UPDATE idempotency_keys SET status_code = :status, response = CAST(:response AS jsonb) WHERE user_id = :userId AND key = :key', {
      ...this.keyOf(c), status: reply.status, response,
    })
  }

  async release(c: IdempotencyClaim): Promise<void> {
    await this.run('DELETE FROM idempotency_keys WHERE user_id = :userId AND key = :key AND response IS NULL', this.keyOf(c))
  }

  async purgeExpired(): Promise<number> {
    const rows = await this.run('DELETE FROM idempotency_keys WHERE created_at < :expiredBefore RETURNING 1', { expiredBefore: this.before(TTL_MS) })
    return rows.length
  }

  // Inserta la clave, o la recupera si la que había ya venció: una sola sentencia, así solo una petición la gana
  private async insert(c: IdempotencyClaim): Promise<boolean> {
    const rows = await this.run(
      `INSERT INTO idempotency_keys (user_id, key, fingerprint, locked_at, created_at) VALUES (:userId, :key, :fingerprint, :now, :now)
       ON CONFLICT (user_id, key) DO UPDATE SET fingerprint = EXCLUDED.fingerprint, status_code = NULL, response = NULL, locked_at = :now, created_at = :now
       WHERE idempotency_keys.created_at < :expiredBefore RETURNING 1`,
      { ...this.keyOf(c), fingerprint: c.fingerprint, now: this.now(), expiredBefore: this.before(TTL_MS) },
    )
    return rows.length > 0
  }

  private async inspect(c: IdempotencyClaim): Promise<ClaimResult> {
    const [row] = await this.run<SavedRow>('SELECT fingerprint, status_code, response FROM idempotency_keys WHERE user_id = :userId AND key = :key', this.keyOf(c))
    // La soltó otra petición entre el intento de insertar y la lectura: se reclama de nuevo
    if (!row) return this.claim(c)
    if (row.fingerprint !== c.fingerprint) return { kind: 'reused' }
    return this.stateOf(c, row)
  }

  private async stateOf(c: IdempotencyClaim, row: SavedRow): Promise<ClaimResult> {
    if (row.response && row.status_code !== null) return { kind: 'replay', reply: this.replyOf(row) }
    return (await this.takeOver(c)) ? { kind: 'new' } : { kind: 'in_progress' }
  }

  private replyOf(row: SavedRow): StoredReply {
    return { status: row.status_code ?? 200, data: row.response?.data, ...(row.response?.location && { location: row.response.location }) }
  }

  // Una petición "en curso" abandonada (el proceso murió a media ejecución) se la queda quien reintenta
  private async takeOver(c: IdempotencyClaim): Promise<boolean> {
    const rows = await this.run(
      'UPDATE idempotency_keys SET locked_at = :now WHERE user_id = :userId AND key = :key AND response IS NULL AND locked_at < :staleBefore RETURNING 1',
      { ...this.keyOf(c), now: this.now(), staleBefore: this.before(STALE_MS) },
    )
    return rows.length > 0
  }

  private keyOf(c: IdempotencyClaim) { return { userId: c.userId, key: c.key } }

  private before(ms: number): Date { return new Date(this.now().getTime() - ms) }

  private run<T extends object = object>(sql: string, replacements: Record<string, unknown>): Promise<T[]> {
    return this.sequelize.query<T>(sql, { replacements, type: QueryTypes.SELECT })
  }
}
