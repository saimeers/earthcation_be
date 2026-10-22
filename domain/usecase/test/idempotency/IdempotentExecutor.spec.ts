import { describe, expect, it } from 'vitest'
import { IdempotencyInProgressError, IdempotencyKeyReusedError, type IdempotencyClaim, type StoredReply } from '@earthcation/model'
import { IdempotentExecutor } from '../../src'
import { InMemoryIdempotencyStore } from '../fakes/InMemoryIdempotency'

const claim = (over: Partial<IdempotencyClaim> = {}): IdempotencyClaim => ({ userId: 'u1', key: 'clave-uno-1', fingerprint: 'f1', ...over })
const reply = (id: string): StoredReply => ({ status: 201, data: { id }, location: `/x/${id}` })

const setup = () => {
  const store = new InMemoryIdempotencyStore()
  let runs = 0
  const action = (id = 'a1') => () => { runs += 1; return Promise.resolve(reply(id)) }
  return { store, executor: new IdempotentExecutor(store), action, runs: () => runs }
}

describe('IdempotentExecutor', () => {
  it('la primera vez ejecuta y guarda; el reintento recibe lo mismo sin repetir la acción', async () => {
    const t = setup()
    const first = await t.executor.execute(claim(), t.action('a1'))
    const retry = await t.executor.execute(claim(), t.action('otro'))
    expect([first.replayed, retry.replayed]).toEqual([false, true])
    expect(retry.reply).toEqual(first.reply)
    expect(t.runs()).toBe(1)
  })

  it('la misma clave con otra petición es un error; otro usuario con esa clave es independiente', async () => {
    const t = setup()
    await t.executor.execute(claim(), t.action())
    await expect(t.executor.execute(claim({ fingerprint: 'f2' }), t.action())).rejects.toThrow(IdempotencyKeyReusedError)
    const other = await t.executor.execute(claim({ userId: 'u2' }), t.action('b1'))
    expect([other.replayed, other.reply.data]).toEqual([false, { id: 'b1' }])
  })

  it('una petición en curso con la misma clave responde "en curso" y no ejecuta', async () => {
    const t = setup()
    await t.store.claim(claim())
    await expect(t.executor.execute(claim(), t.action())).rejects.toThrow(IdempotencyInProgressError)
    expect(t.runs()).toBe(0)
  })

  it('si la acción falla, la clave se suelta y el reintento se ejecuta', async () => {
    const t = setup()
    await expect(t.executor.execute(claim(), () => Promise.reject(new Error('cayó')))).rejects.toThrow('cayó')
    expect(t.store.rows.size).toBe(0)
    expect((await t.executor.execute(claim(), t.action())).replayed).toBe(false)
  })
})
