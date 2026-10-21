import { beforeEach, describe, expect, it } from 'vitest'
import { InvalidVarkStyleError, VarkAnswersRequiredError, VarkResultNotFoundError } from '@earthcation/model'
import {
  GetMyVarkResultUseCase, ListVarkResultsByPlaceUseCase, ListVarkResultsByStyleUseCase, ListVarkResultsUseCase,
  SubmitVarkTestUseCase,
} from '../../src'
import { InMemoryVarkRepository } from '../fakes/InMemoryVark'

describe('casos de uso VARK', () => {
  let repo: InMemoryVarkRepository
  beforeEach(() => { repo = new InMemoryVarkRepository() })

  it('el primer envío crea y el segundo reemplaza', async () => {
    const submit = new SubmitVarkTestUseCase(repo)
    expect(await submit.execute({ userId: 'u1', answers: { q1: 'B' } }))
      .toEqual({ created: true, scores: { visual: 1, auditory: 0, reading: 0, dominantStyle: 'Visual' } })
    expect(await submit.execute({ userId: 'u1', answers: { q1: 'A' } })).toMatchObject({ created: false })
    expect((await new GetMyVarkResultUseCase(repo).execute('u1')).dominantStyle).toBe('Lector/Escritor')
    expect(repo.rows.size).toBe(1)
  })

  it('sin answers no guarda nada', async () => {
    await expect(new SubmitVarkTestUseCase(repo).execute({ userId: 'u1', answers: undefined })).rejects.toThrow(VarkAnswersRequiredError)
    expect(repo.rows.size).toBe(0)
  })

  it('sin resultado guardado es VarkResultNotFoundError', async () => {
    await expect(new GetMyVarkResultUseCase(repo).execute('u2')).rejects.toThrow(VarkResultNotFoundError)
  })

  it('lista todos, por estilo (validado) y por localidad', async () => {
    const submit = new SubmitVarkTestUseCase(repo)
    await submit.execute({ userId: 'u1', answers: { q1: 'B' } })
    await submit.execute({ userId: 'u2', answers: { q1: 'C' } })
    repo.places.set('u2', { department: 'Norte de Santander', municipality: 'Cúcuta' })
    expect(await new ListVarkResultsUseCase(repo).execute()).toHaveLength(2)
    expect(await new ListVarkResultsByStyleUseCase(repo).execute('Auditivo')).toMatchObject([{ userId: 'u2' }])
    await expect(new ListVarkResultsByStyleUseCase(repo).execute('Kinestésico')).rejects.toThrow(InvalidVarkStyleError)
    expect(await new ListVarkResultsByPlaceUseCase(repo).execute({ department: 'Norte de Santander' })).toMatchObject([{ userId: 'u2' }])
    expect(await new ListVarkResultsByPlaceUseCase(repo).execute({ municipality: 'Pamplona' })).toEqual([])
  })
})
