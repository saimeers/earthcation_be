import { beforeEach, describe, expect, it } from 'vitest'
import { SessionCodeInvalidError, SessionFinishedError } from '@earthcation/model'
import { CreateRoomUseCase, EndRoomUseCase, GetRoomByCodeUseCase, JoinRoomUseCase, StartRoomUseCase } from '../../src'
import { FixedClock, InMemoryCache } from '../fakes/InMemoryObservability'
import { InMemorySessionRepository } from '../fakes/InMemorySessions'

describe('casos de uso de sesiones', () => {
  let repo: InMemorySessionRepository
  let cache: InMemoryCache
  let clock: FixedClock

  beforeEach(() => {
    repo = new InMemorySessionRepository()
    repo.usedCodes.add('000')
    cache = new InMemoryCache()
    clock = new FixedClock(0)
  })

  it('código libre: reintenta si el sorteado está en uso', async () => {
    const randoms = [0, 0.5]
    const create = new CreateRoomUseCase(repo, () => randoms.shift() ?? 0.7)
    const session = await create.execute({ instructorId: 'i1', body: { name: 'Sala', location_id: 'L' } })
    expect(session.code).toBe('500')
  })

  it('unirse: dos veces no duplica; una sala finalizada no acepta', async () => {
    await repo.create({ instructorId: 'i1', locationId: 'L', name: 'Sala', code: '042' })
    const join = new JoinRoomUseCase(repo)
    expect(await join.execute({ userId: 'p', body: { code: '042' } })).toMatchObject({ joined: true })
    expect(await join.execute({ userId: 'p', body: { code: '042' } })).toMatchObject({ joined: false })
    const [id] = [...repo.rooms.keys()] as [string]
    await repo.update(id, { status: 'finished' })
    await expect(join.execute({ userId: 'p', body: { code: '042' } })).rejects.toThrow(SessionFinishedError)
    await expect(join.execute({ userId: 'p', body: { code: 'nada' } })).rejects.toThrow(SessionCodeInvalidError)
  })

  it('iniciar y terminar invalidan la caché del detalle', async () => {
    await repo.create({ instructorId: 'i1', locationId: 'L', name: 'Sala', code: '042' })
    const [id] = [...repo.rooms.keys()] as [string]
    const start = new StartRoomUseCase({ repo, cache, clock })
    expect(await start.execute({ id, instructorId: 'i1' })).toMatchObject({ status: 'active' })
    const end = new EndRoomUseCase({ repo, cache, clock })
    expect(await end.execute({ id, instructorId: 'i1' })).toMatchObject({ status: 'finished' })
  })

  it('el código de 3 dígitos muestra la sala viva sin inscribir', async () => {
    await repo.create({ instructorId: 'i1', locationId: 'L', name: 'Sala', code: '042' })
    expect(await new GetRoomByCodeUseCase(repo).execute('042')).toMatchObject({ status: 'waiting' })
  })
})
