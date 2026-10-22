import type { ClaimResult, IdempotencyClaim, IdempotencyStore, StoredReply } from '@earthcation/model'

interface Row { fingerprint: string, reply: StoredReply | null }

/** Almacén de claves en memoria: la clave es usuario + clave del cliente. */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  readonly rows = new Map<string, Row>()

  claim(c: IdempotencyClaim): Promise<ClaimResult> {
    const id = `${c.userId}|${c.key}`
    const row = this.rows.get(id)
    if (!row) {
      this.rows.set(id, { fingerprint: c.fingerprint, reply: null })
      return Promise.resolve({ kind: 'new' })
    }
    if (row.fingerprint !== c.fingerprint) return Promise.resolve({ kind: 'reused' })
    return Promise.resolve(row.reply ? { kind: 'replay', reply: row.reply } : { kind: 'in_progress' })
  }

  complete(c: IdempotencyClaim, reply: StoredReply): Promise<void> {
    const row = this.rows.get(`${c.userId}|${c.key}`)
    if (row) row.reply = reply
    return Promise.resolve()
  }

  release(c: IdempotencyClaim): Promise<void> {
    this.rows.delete(`${c.userId}|${c.key}`)
    return Promise.resolve()
  }

  purgeExpired(): Promise<number> { return Promise.resolve(0) }
}
