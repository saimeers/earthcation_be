import { describe, expect, it } from 'vitest'
import { DivipolaCoordinates } from '../src'

describe('coordenadas DIVIPOLA', () => {
  it('nombres del catálogo contra los oficiales', () => {
    const coords = new DivipolaCoordinates()
    expect(coords.locate('Cúcuta', 'Norte de Santander')).toMatchObject({ code: '54001', exact: true })
    expect(coords.locate('Tumaco', 'Nariño')).toMatchObject({ exact: true })
    expect(coords.locate('Bogotá', 'Bogotá D.C.')).toMatchObject({ code: '11001', exact: true })
  })

  it('sin coincidencia cae a la capital; sin departamento, null', () => {
    const coords = new DivipolaCoordinates()
    expect(coords.locate('Pueblo Inventado', 'Antioquia')).toMatchObject({ code: '05001', exact: false })
    expect(coords.locate('X', 'Departamento Falso')).toBeNull()
  })

  it('memoriza la búsqueda (mismo resultado en la segunda consulta)', () => {
    const coords = new DivipolaCoordinates()
    const first = coords.locate('Cúcuta', 'Norte de Santander')
    expect(coords.locate('Cúcuta', 'Norte de Santander')).toEqual(first)
  })
})
