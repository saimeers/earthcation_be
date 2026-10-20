import { describe, expect, it } from 'vitest'
import { Location, LocationFieldsRequiredError, Organization, OrganizationNameRequiredError } from '../../src'

const mina = () => Organization.restore({ id: 'o1', name: 'Mina A', type: 'Mina', isActive: true, createdAt: new Date(0) })

describe('Organization', () => {
  it('prepara una nueva con nombre obligatorio y tipo opcional', () => {
    expect(Organization.prepare('Mina B', 'Mina')).toEqual({ name: 'Mina B', type: 'Mina' })
    expect(Organization.prepare('Mina B', '')).toEqual({ name: 'Mina B', type: null })
    expect(() => Organization.prepare('')).toThrow(OrganizationNameRequiredError)
    expect(() => Organization.prepare(undefined)).toThrow('El nombre es requerido')
  })

  it('solo cambia nombre y tipo, y valida el nombre', () => {
    const o = mina()
    o.change({ type: null })
    expect([o.name, o.type]).toEqual(['Mina A', null])
    o.change({ name: 'Mina Renombrada' })
    expect(o.name).toBe('Mina Renombrada')
    expect(() => { o.change({ name: '' }) }).toThrow(OrganizationNameRequiredError)
  })

  it('se deshabilita y se habilita, nunca se borra', () => {
    const o = mina()
    o.disable()
    expect(o.isActive).toBe(false)
    o.enable()
    expect(o.toProps()).toMatchObject({ id: 'o1', isActive: true })
  })
})

describe('Location', () => {
  it('municipio y departamento son obligatorios; el país es opcional', () => {
    expect(Location.prepare({ municipality: 'Cúcuta', department: 'Norte de Santander' }))
      .toEqual({ municipality: 'Cúcuta', department: 'Norte de Santander' })
    expect(Location.prepare({ municipality: 'Tibú', department: 'NdS', country: 'Colombia' })).toMatchObject({ country: 'Colombia' })
    expect(() => Location.prepare({ municipality: 'Tibú' })).toThrow(LocationFieldsRequiredError)
  })

  it('cambia solo municipio, departamento y país', () => {
    const l = Location.restore({ id: 'l1', municipality: 'A', department: 'B', country: 'Colombia', isActive: true })
    l.change({ municipality: 'C' })
    expect(l.toProps()).toEqual({ id: 'l1', municipality: 'C', department: 'B', country: 'Colombia', isActive: true })
  })
})
