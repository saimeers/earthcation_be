import {
  IdempotencyInProgressError, IdempotencyKeyReusedError,
  type ClaimResult, type IdempotencyClaim, type IdempotencyStore, type StoredReply,
} from '@earthcation/model'

export interface Execution {
  readonly reply: StoredReply
  /** true si es la respuesta guardada de una ejecución anterior (la acción no se repitió). */
  readonly replayed: boolean
}

/**
 * Ejecuta una acción una sola vez por clave: un reintento de red (mismo usuario, misma clave, misma petición) recibe la
 * respuesta guardada en vez de crear el dato otra vez. Si la acción falla, la clave se suelta para poder reintentar.
 */
export class IdempotentExecutor {
  constructor(private readonly store: IdempotencyStore) {}

  async execute(claim: IdempotencyClaim, action: () => Promise<StoredReply>): Promise<Execution> {
    const result = await this.store.claim(claim)
    if (result.kind === 'new') return this.runOnce(claim, action)
    return { reply: this.stored(result), replayed: true }
  }

  private stored(result: Exclude<ClaimResult, { kind: 'new' }>): StoredReply {
    if (result.kind === 'replay') return result.reply
    throw result.kind === 'reused' ? new IdempotencyKeyReusedError() : new IdempotencyInProgressError()
  }

  private async runOnce(claim: IdempotencyClaim, action: () => Promise<StoredReply>): Promise<Execution> {
    const reply = await this.attempt(claim, action)
    await this.store.complete(claim, reply)
    return { reply, replayed: false }
  }

  private async attempt(claim: IdempotencyClaim, action: () => Promise<StoredReply>): Promise<StoredReply> {
    try {
      return await action()
    } catch (error) {
      await this.store.release(claim)
      throw error
    }
  }
}
