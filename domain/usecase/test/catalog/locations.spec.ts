import { beforeEach, describe, expect, it } from 'vitest'
import { LocationFieldsRequiredError, LocationNotFoundError, LocationTakenError } from '@earthcation/model'
import {
  ChangeLocationStatusUseCase, CreateLocationUseCase, GetLocationUseCase, SearchLocationsUseCase, SeedPlaceCatalogUseCase,
  UpdateLocationUseCase,
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

  it('siembra el catálogo de municipios una sola vez, sin repetir los que ya existen', async () => {
    await new CreateLocationUseCase(repo).execute({ municipality: ' tibú ', department: 'NORTE DE SANTANDER' })
    const catalog = {
      departments: () => [
        { name: 'Norte de Santander', municipalities: ['Tibú', 'Sardinata', 'Sardinata'] },
        { name: 'Boyacá', municipalities: ['Sogamoso'] },
      ],
    }
    const seed = new SeedPlaceCatalogUseCase({ catalog, locations: repo })
    expect(await seed.execute()).toBe(2)
    expect(await seed.execute()).toBe(0)
    expect([...repo.rows.values()].map((l) => [l.municipality, l.department, l.country])).toEqual([
      [' tibú ', 'NORTE DE SANTANDER', 'Colombia'],
      ['Sardinata', 'Norte de Santander', 'Colombia'],
      ['Sogamoso', 'Boyacá', 'Colombia'],
    ])
  })
})
