import { beforeEach, describe, expect, it } from 'vitest'
import { LocationFieldsRequiredError, LocationNotFoundError, LocationTakenError } from '@earthcation/model'
import {
  ChangeLocationStatusUseCase, CreateLocationUseCase, GetLocationUseCase, SearchLocationsUseCase, UpdateLocationUseCase,
} from '../../src'
import { InMemoryLocationRepository } from '../fakes/InMemoryCatalog'

describe('casos de uso de localidades', () => {
  let repo: InMemoryLocationRepository
  beforeEach(() => { repo = new InMemoryLocationRepository() })

  it('crea una por par municipio + departamento, con Colombia por defecto', async () => {
    const create = new CreateLocationUseCase(repo)
    const created = await create.execute({ municipality: 'Tibú', department: 'Norte de Santander' })
    expect(created.country).toBe('Colombia')
    await expect(create.execute({ municipality: 'Tibú', department: 'Norte de Santander' })).rejects.toThrow(LocationTakenError)
    await expect(create.execute({ municipality: 'Tibú', department: '' })).rejects.toThrow(LocationFieldsRequiredError)
  })

  it('una deshabilitada no se consulta ni se busca, pero se puede volver a habilitar', async () => {
    const { id } = await new CreateLocationUseCase(repo).execute({ municipality: 'Sardinata', department: 'NdS' })
    await new UpdateLocationUseCase(repo).execute({ id, changes: { municipality: 'Sardinata Centro' } })
    await new ChangeLocationStatusUseCase(repo).execute({ id, active: false })
    await expect(new GetLocationUseCase(repo).execute(id)).rejects.toThrow(LocationNotFoundError)
    expect(await new SearchLocationsUseCase(repo).execute({ municipality: 'sardinata' })).toEqual([])
    const enabled = await new ChangeLocationStatusUseCase(repo).execute({ id, active: true })
    expect([enabled.municipality, enabled.isActive]).toEqual(['Sardinata Centro', true])
  })
})
