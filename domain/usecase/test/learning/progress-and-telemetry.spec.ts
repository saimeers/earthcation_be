import { beforeEach, describe, expect, it } from 'vitest'
import { AttemptNotFoundError, RiskNotFoundError } from '@earthcation/model'
import { EndAttemptUseCase, SaveEventsUseCase, SaveProgressUseCase, StartAttemptUseCase } from '../../src'
import { InMemoryCache, FixedClock } from '../fakes/InMemoryObservability'
import { InMemoryFreePlaySessions, InMemoryLearningRepository } from '../fakes/InMemoryLearning'

describe('casos de uso de aprendizaje', () => {
  let repo: InMemoryLearningRepository
  let freePlaySessions: InMemoryFreePlaySessions
  let cache: InMemoryCache
  let clock: FixedClock

  beforeEach(() => {
    repo = new InMemoryLearningRepository()
    freePlaySessions = new InMemoryFreePlaySessions()
    cache = new InMemoryCache()
    clock = new FixedClock(0)
  })

  it('resultado sin sala usa la del intento o la sesión libre', async () => {
    const save = new SaveProgressUseCase({ repo, freePlaySessions })
    repo.attemptSessions.set('mio', 'sala-del-intento')
    await save.execute({ userId: 'u', body: { risk_id: 'CR-01', attempt_id: 'mio', is_mitigated: true } })
    await save.execute({ userId: 'u', body: { risk_id: 'CR-01' } })
    expect(repo.results.map((r) => r.session_id)).toEqual(['sala-del-intento', 'juego-libre'])
    await expect(save.execute({ userId: 'u', body: { risk_id: 'CR-99' } })).rejects.toThrow(RiskNotFoundError)
  })

  it('intento nuevo numerado y con nivel por número; eventos solo en intentos propios', async () => {
    const start = new StartAttemptUseCase({ repo, freePlaySessions, cache, clock })
    await repo.createAttempt({ userId: 'u', levelKey: 'level2', levelId: null, sessionId: null, attemptNumber: 1, varkStyle: null, gasBrand: null, gameVersion: null })
    await repo.createAttempt({ userId: 'u', levelKey: 'level2', levelId: null, sessionId: null, attemptNumber: 2, varkStyle: null, gasBrand: null, gameVersion: null })
    const attempt = await start.execute({ userId: 'u', body: { level_key: 'level2' } })
    expect(attempt).toMatchObject({ attempt_number: 3, level_id: 2, session_id: 'juego-libre' })

    const [ownId] = [...repo.attempts.keys()]
    const saveEvents = new SaveEventsUseCase(repo)
    const saved = await saveEvents.execute({ userId: 'u', body: { attempt_id: ownId, events: [{ event_type: 'a' }, { event_type: 'b' }] } })
    expect(saved).toBe(2)

    const endAttempt = new EndAttemptUseCase({ repo, clock })
    await expect(endAttempt.execute({ userId: 'u', attemptId: 'ajeno', body: {} })).rejects.toThrow(AttemptNotFoundError)
  })
})
