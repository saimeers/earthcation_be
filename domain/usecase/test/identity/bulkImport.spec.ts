import { describe, expect, it } from 'vitest'
import { ExcelRequiredError, ImportRowsRequiredError, PlaceMatcher } from '@earthcation/model'
import { ConfirmBulkImportUseCase, PreviewBulkImportUseCase } from '../../src'
import { fakeGenerator, fakeHasher, InMemoryDirectory, InMemoryUserRepository } from '../fakes/InMemoryIdentity'

const places = new PlaceMatcher({ departments: () => [{ name: 'Norte de Santander', municipalities: ['Cúcuta'] }] })

describe('importación masiva', () => {
  it('vista previa: marca las ya registradas sin escribir', async () => {
    const users = new InMemoryUserRepository()
    users.add({ id: 'p', cedula: '1' })
    const sheet = [['DOCUMENTO DE IDENTIDAD', '', 'NOMBRE(S) Y APELLIDOS'], ['', 'NÚMERO', ''], ['CC', '1', 'Ya Existe'], ['CC', '2', 'Nueva Persona']]
    const preview = new PreviewBulkImportUseCase({ spreadsheets: { firstSheet: () => sheet }, users })
    expect((await preview.execute({ file: new Uint8Array() })).map((r) => r.status)).toEqual(['duplicate_in_db', 'ok'])
    await expect(preview.execute({ file: undefined })).rejects.toThrow(ExcelRequiredError)
    expect(users.rows.size).toBe(1)
  })

  it('confirmar: una fila que falla no detiene las demás; la organización repetida se crea una vez', async () => {
    const users = new InMemoryUserRepository()
    users.add({ id: 'p', cedula: '1' })
    users.failOn = 'roto'
    const confirm = new ConfirmBulkImportUseCase({ users, directory: new InMemoryDirectory(), places, passwords: fakeHasher, generator: fakeGenerator })
    const r = await confirm.execute({ rows: [
      { cedula: 'roto', firstName: 'A' }, { cedula: '1', firstName: 'B' }, { cedula: '', firstName: 'Sin cédula' },
      { cedula: '7', firstName: 'C', organizationName: 'mina', locationMunicipality: 'CUCUTA', locationDepartment: 'Norte de Santender' },
      { cedula: '8', firstName: 'D', organizationName: 'MINA ', locationMunicipality: 'Pueblo', locationDepartment: 'Falso' },
    ] })
    expect(r.errors).toEqual([{ cedula: 'roto', reason: 'valor inválido' }])
    expect(r.skipped).toEqual([{ cedula: '1', reason: 'Cédula ya registrada' }, { cedula: '', reason: 'Datos incompletos' }])
    expect(r.created.map((c) => [c.cedula, c.organizationCreated, c.locationNoMatch])).toEqual([
      ['7', 'mina', null], ['8', null, 'Pueblo, Falso'],
    ])
    expect((await users.findByCedula('7'))?.toProps()).toMatchObject({ username: '7', role: 'player', lastName: '', placement: { organizationId: 'o0', locationId: 'l1' } })
    await expect(confirm.execute({ rows: [] })).rejects.toThrow(ImportRowsRequiredError)
  })
})
