import { describe, expect, it } from 'vitest'
import {
  AnmColumnsMissingError, AnmHeaderMissingError, AnmSheet, levenshtein, PlaceMatcher, splitFullName, type AnmRow, type PlaceCatalog,
} from '../../src'

describe('planilla ANM', () => {
  it('nombre completo: el último término es el apellido', () => {
    expect(splitFullName('Ana María López')).toEqual({ firstName: 'Ana María', lastName: 'López' })
    expect(splitFullName('Ana')).toEqual({ firstName: 'Ana', lastName: '' })
    expect(splitFullName('')).toEqual({ firstName: '', lastName: '' })
  })

  const sheet = [
    ['título'],
    ['DOCUMENTO DE\r\nIDENTIDAD', '', 'NOMBRE(S) Y APELLIDOS', 'EMPRESA', '', 'SOCORREDOR', ''],
    ['TIPO', 'Número', '', 'NOMBRE', 'CORREO ELECTRÓNICO', 'MUNICIPIO DE RESIDENCIA', 'CORREO ELECTRÓNICO'],
    ['CC', ' 1001 ', 'Luis Peña', 'Mina A', 'empresa@x.co', 'Tibú', 'luis@x.co'],
    ['CC', '', 'Relleno', '', '', '', ''],
    ['CC', 1001, 'Otro Luis', '', '', '', ''],
  ]

  it('lee filas con el correo del socorredor (no el de la empresa) e ignora las que no tienen cédula', () => {
    const { rows } = AnmSheet.read(sheet)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ cedula: '1001', firstName: 'Luis', lastName: 'Peña', email: 'luis@x.co', organizationName: 'Mina A', age: null })
  })

  it('sin encabezado o sin columna de cédula', () => {
    expect(() => AnmSheet.read([['hola']])).toThrow(AnmHeaderMissingError)
    expect(() => AnmSheet.read([['DOCUMENTO DE IDENTIDAD'], ['NOMBRE(S) Y APELLIDOS']]))
      .toThrow(new AnmColumnsMissingError(['número de documento']).message)
  })

  it('estados de la vista previa', () => {
    const base = { lastName: '', age: null, email: '', organizationName: '', locationMunicipality: '', locationDepartment: '' }
    const rows: AnmRow[] = [
      { ...base, cedula: '1', firstName: 'A' }, { ...base, cedula: '1', firstName: 'B' },
      { ...base, cedula: '2', firstName: '' }, { ...base, cedula: '3', firstName: 'C' }, { ...base, cedula: '4', firstName: 'D' },
    ]
    const header = [['DOCUMENTO DE IDENTIDAD', '', 'NOMBRE(S) Y APELLIDOS'], ['', 'NÚMERO', '']]
    const sheetOf = AnmSheet.read([...header, ...rows.map((r) => ['', r.cedula, r.firstName])])
    expect(sheetOf.cedulas).toEqual(['1', '1', '2', '3', '4'])
    expect(sheetOf.preview(new Set(['3'])).map((r) => r.status)).toEqual(['ok', 'duplicate_in_file', 'missing_required', 'duplicate_in_db', 'ok'])
  })
})

describe('catálogo de municipios', () => {
  const catalog: PlaceCatalog = {
    departments: () => [
      { name: 'Norte de Santander', municipalities: ['Cúcuta', 'Tibú'] },
      { name: 'Bogotá D.C.', municipalities: ['Bogotá'] },
    ],
  }
  const places = new PlaceMatcher(catalog)

  it('distancia de edición', () => {
    expect(levenshtein('SANTANDER', 'SANTENDER')).toBe(1)
    expect(levenshtein('', 'ABC')).toBe(3)
    expect(levenshtein('KITTEN', 'SITTING')).toBe(3)
  })

  it('tolera mayúsculas, tildes, typos y alias', () => {
    expect(places.match('cucuta', 'NORTE DE SANTENDER')).toEqual({ municipality: 'Cúcuta', department: 'Norte de Santander' })
    expect(places.match('Bogota', 'Bogota')).toEqual({ municipality: 'Bogotá', department: 'Bogotá D.C.' })
    expect(places.match('Ciudad Gótica', 'Norte de Santander')).toBeNull()
  })

  it('sin coincidencia se usa el texto del Excel marcado', () => {
    expect(places.query(' Gótica ', ' Nowhere ')).toEqual({ municipality: 'Gótica', department: 'Nowhere', noMatch: true })
    expect(places.query('', 'Norte de Santander')).toBeNull()
  })
})
