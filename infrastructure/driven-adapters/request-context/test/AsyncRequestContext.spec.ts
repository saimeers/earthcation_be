import { describe, expect, it } from 'vitest'
import { AsyncRequestContext } from '../src'

const origin = { ipHash: 'abc', userAgent: 'curl' }

describe('AsyncRequestContext', () => {
  it('fuera de una petición no hay ámbito', () => {
    expect(new AsyncRequestContext().current()).toBeNull()
  })

  it('el actor que se pone dentro de la petición lo ve todo lo que corre después, también tras un await', async () => {
    const ctx = new AsyncRequestContext()
    const seen = await ctx.run(origin, async () => {
      ctx.setActor({ id: 'u1', role: 'admin' })
      await Promise.resolve()
      return ctx.current()
    })
    expect(seen).toEqual({ origin, actor: { id: 'u1', role: 'admin' } })
  })

  it('peticiones concurrentes no se mezclan', async () => {
    const ctx = new AsyncRequestContext()
    const run = (id: string, delay: number) => ctx.run(origin, async () => {
      ctx.setActor({ id, role: 'player' })
      await new Promise((r) => setTimeout(r, delay))
      return ctx.current()?.actor?.id
    })
    expect(await Promise.all([run('a', 20), run('b', 5)])).toEqual(['a', 'b'])
  })

  it('setActor fuera de una petición no hace nada', () => {
    const ctx = new AsyncRequestContext()
    ctx.setActor({ id: 'x', role: 'admin' })
    expect(ctx.current()).toBeNull()
  })
})
