import { beforeEach, describe, expect, it } from 'vitest'
import { OrganizationNameRequiredError, OrganizationNameTakenError, OrganizationNotFoundError } from '@earthcation/model'
import {
  ChangeOrganizationStatusUseCase, CreateOrganizationUseCase, GetOrganizationUseCase, ListOrganizationTypesUseCase,
  SearchOrganizationsUseCase, UpdateOrganizationUseCase,
} from '../../src'
import { InMemoryOrganizationRepository } from '../fakes/InMemoryCatalog'

describe('casos de uso de organizaciones', () => {
  let repo: InMemoryOrganizationRepository
  beforeEach(() => { repo = new InMemoryOrganizationRepository() })

  it('crea con nombre único y obligatorio', async () => {
    const create = new CreateOrganizationUseCase(repo)
    const created = await create.execute({ name: 'Mina A', type: 'Mina' })
    expect(created.toProps()).toMatchObject({ name: 'Mina A', type: 'Mina', isActive: true })
    await expect(create.execute({ name: 'Mina A' })).rejects.toThrow(OrganizationNameTakenError)
    await expect(create.execute({ name: '' })).rejects.toThrow(OrganizationNameRequiredError)
  })

  it('edita, deshabilita y la deshabilitada no sale en la búsqueda ni en los tipos', async () => {
    const { id } = await new CreateOrganizationUseCase(repo).execute({ name: 'Mina A', type: 'Mina' })
    await new UpdateOrganizationUseCase(repo).execute({ id, changes: { name: 'Mina Norte' } })
    expect((await new SearchOrganizationsUseCase(repo).execute({ name: 'norte' })).map((o) => o.name)).toEqual(['Mina Norte'])
    await new ChangeOrganizationStatusUseCase(repo).execute({ id, active: false })
    expect(await new SearchOrganizationsUseCase(repo).execute({})).toEqual([])
    expect(await new ListOrganizationTypesUseCase(repo).execute()).toEqual([])
  })

  it('una inexistente es OrganizationNotFoundError', async () => {
    await expect(new GetOrganizationUseCase(repo).execute('nada')).rejects.toThrow(OrganizationNotFoundError)
    await expect(new UpdateOrganizationUseCase(repo).execute({ id: 'nada', changes: {} })).rejects.toThrow('Organización no encontrada')
    await expect(new ChangeOrganizationStatusUseCase(repo).execute({ id: 'nada', active: true })).rejects.toThrow(OrganizationNotFoundError)
  })
})
