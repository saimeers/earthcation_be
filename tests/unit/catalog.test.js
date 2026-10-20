import { describe, it, expect } from 'vitest'
import { makeLocations, makeOrganizations } from '../../src/contexts/catalog/application'
import { toOrganizationPatch } from '../../src/contexts/catalog/domain'

// Casos de uso del catálogo con repositorios en memoria: sin BD ni Express
const memoryOrganizations = (rows = []) => ({
  list: async () => rows,
  search: async () => rows,
  types: async () => [],
  findDetail: async (id) => rows.find(r => r.id === id) ?? null,
  findByName: async (name) => rows.find(r => r.name === name) ?? null,
  create: async (d) => { const o = { id: `o${rows.length + 1}`, type: null, isActive: true, createdAt: new Date(0), ...d }; rows.push(o); return o },
  update: async (id, p) => { const o = rows.find(r => r.id === id); return o ? Object.assign(o, p) : null },
})

const memoryLocations = (rows = []) => ({
  list: async () => rows,
  search: async () => rows,
  findActive: async (id) => rows.find(r => r.id === id && r.isActive) ?? null,
  findByPlace: async (m, d) => rows.find(r => r.municipality === m && r.department === d) ?? null,
  create: async (d) => { const l = { id: `l${rows.length + 1}`, country: 'Colombia', isActive: true, ...d }; rows.push(l); return l },
  update: async (id, p) => { const l = rows.find(r => r.id === id); return l ? Object.assign(l, p) : null },
})

describe('organizaciones', () => {
  it('crear exige nombre y no repite nombres', async () => {
    const orgs = makeOrganizations(memoryOrganizations())
    expect(await orgs.create({})).toMatchObject({ ok: false, error: { code: 'ORGANIZATION_NAME_REQUIRED', kind: 'validation' } })
    expect(await orgs.create({ name: 'Mina A', type: 'Mina' })).toMatchObject({ ok: true, value: { name: 'Mina A', type: 'Mina' } })
    expect(await orgs.create({ name: 'Mina A' })).toMatchObject({ ok: false, error: { code: 'ORGANIZATION_NAME_TAKEN', kind: 'conflict' } })
  })

  it('no encontrada', async () => {
    const orgs = makeOrganizations(memoryOrganizations())
    expect(await orgs.get('x')).toMatchObject({ ok: false, error: { kind: 'not_found', message: 'Organización no encontrada' } })
    expect(await orgs.setActive('x', false)).toMatchObject({ ok: false, error: { code: 'ORGANIZATION_NOT_FOUND' } })
  })

  it('editar solo cambia nombre y tipo', () => {
    expect(toOrganizationPatch({ name: 'B', is_active: false, id: 'otro', isActive: false })).toEqual({ name: 'B' })
  })

  it('deshabilitar y habilitar', async () => {
    const orgs = makeOrganizations(memoryOrganizations([{ id: 'o1', name: 'A', type: null, isActive: true, createdAt: new Date(0) }]))
    expect(await orgs.setActive('o1', false)).toMatchObject({ ok: true, value: { isActive: false } })
    expect(await orgs.setActive('o1', true)).toMatchObject({ ok: true, value: { isActive: true } })
  })
})

describe('localidades', () => {
  it('crear exige municipio y departamento y no repite el lugar', async () => {
    const locs = makeLocations(memoryLocations())
    expect(await locs.create({ municipality: 'Cúcuta' })).toMatchObject({ ok: false, error: { code: 'LOCATION_FIELDS_REQUIRED' } })
    expect(await locs.create({ municipality: 'Cúcuta', department: 'Norte de Santander' }))
      .toMatchObject({ ok: true, value: { country: 'Colombia' } })
    expect(await locs.create({ municipality: 'Cúcuta', department: 'Norte de Santander' }))
      .toMatchObject({ ok: false, error: { code: 'LOCATION_TAKEN' } })
  })

  it('una localidad deshabilitada no se encuentra por id', async () => {
    const locs = makeLocations(memoryLocations([{ id: 'l1', municipality: 'X', department: 'Y', country: 'Colombia', isActive: false }]))
    expect(await locs.get('l1')).toMatchObject({ ok: false, error: { code: 'LOCATION_NOT_FOUND' } })
  })
})
