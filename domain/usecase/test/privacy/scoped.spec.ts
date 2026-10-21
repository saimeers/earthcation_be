import { describe, expect, it } from 'vitest'
import type { AuditActor, AuditOrigin, ReadScope, RequestContext, RequestScope } from '@earthcation/model'
import { UserOutOfScopeError } from '@earthcation/model'
import { deniedTo, scoped } from '../../src'

class FakeContext implements RequestContext {
  constructor(public actor: AuditActor | null) {}

  run<T>(_origin: AuditOrigin | null, work: () => T): T { return work() }
  setActor(actor: AuditActor): void { this.actor = actor }
  current(): RequestScope | null { return { origin: null, actor: this.actor } }
}

const scope: ReadScope = { visiblePlayerIds: (id) => Promise.resolve(new Set(id === 'ins-1' ? ['p1', 'p2'] : [])) }

const rows = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'admin-1' }]
const listUsers = { execute: (): Promise<typeof rows> => Promise.resolve(rows) }
const getUser = { execute: (id: string) => Promise.resolve({ id }) }

const as = (role: string, id = 'ins-1') => ({ scope, context: new FakeContext({ id, role }) })

describe('scoped', () => {
  it('el instructor solo ve las filas de su alcance', async () => {
    const list = scoped(listUsers, { rowOwner: (r) => r.id as string }, as('instructor'))
    expect(await list.execute()).toEqual([{ id: 'p1' }, { id: 'p2' }, { id: 'admin-1' }].filter((r) => r.id !== 'admin-1'))
  })

  it('el instructor se ve a sí mismo en una lista', async () => {
    const list = scoped(listUsers, { rowOwner: (r) => r.id as string }, as('instructor', 'p3'))
    expect((await list.execute()).map((r) => r.id)).toEqual(['p3'])
  })

  it('pedir a alguien fuera de su alcance es 403, antes de ejecutar; dentro del alcance pasa', async () => {
    let calls = 0
    const counting = { execute: (id: string) => { calls += 1; return Promise.resolve({ id }) } }
    const get = scoped(counting, { target: ([id]) => id }, as('instructor'))
    await expect(get.execute('p3')).rejects.toThrow(UserOutOfScopeError)
    expect(calls).toBe(0)
    expect(await get.execute('p1')).toEqual({ id: 'p1' })
    expect(await get.execute('ins-1')).toEqual({ id: 'ins-1' })
  })

  it('un resultado único se niega después de leerlo si su dueño no está en el alcance', async () => {
    const detail = { execute: (owner: string) => Promise.resolve({ attempt: { user_id: owner } }) }
    const get = scoped(detail, { resultOwner: (r) => r.attempt.user_id }, as('instructor'))
    await expect(get.execute('p3')).rejects.toThrow(UserOutOfScopeError)
    expect((await get.execute('p2')).attempt.user_id).toBe('p2')
  })

  it('admin, desarrollador, jugador y llamadas fuera de una petición no se acotan', async () => {
    for (const role of ['admin', 'developer', 'player']) {
      expect(await scoped(listUsers, { rowOwner: (r) => r.id as string }, as(role)).execute()).toHaveLength(4)
      expect(await scoped(getUser, { target: ([id]) => id }, as(role)).execute('p3')).toEqual({ id: 'p3' })
    }
    const noRequest = { scope, context: new FakeContext(null) }
    expect(await scoped(listUsers, { rowOwner: (r) => r.id as string }, noRequest).execute()).toHaveLength(4)
  })

  it('sigue siendo del mismo tipo', () => {
    class Real { execute(): Promise<number> { return Promise.resolve(1) } }
    expect(scoped(new Real(), {}, as('instructor'))).toBeInstanceOf(Real)
  })
})

describe('deniedTo', () => {
  const run = { execute: () => Promise.resolve('informe') }
  const denial = { roles: ['developer'], message: 'No disponible' }

  it('niega a los roles indicados con un 403 y deja pasar a los demás', async () => {
    await expect(deniedTo(run, denial, new FakeContext({ id: 'd', role: 'developer' })).execute()).rejects.toThrow('No disponible')
    expect(await deniedTo(run, denial, new FakeContext({ id: 'a', role: 'admin' })).execute()).toBe('informe')
    expect(await deniedTo(run, denial, new FakeContext(null)).execute()).toBe('informe')
  })
})
