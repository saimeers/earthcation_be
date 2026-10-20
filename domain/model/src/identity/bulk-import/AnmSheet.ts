import { AnmColumnsMissingError, AnmHeaderMissingError } from '../errors/IdentityErrors'
import { cellText, normalize } from './normalize'

// Formato oficial ANM (Base de Datos Anual de Personal Capacitado y Entrenado en Estándares de Competencias en
// Seguridad y Salvamento Minero). La fila de encabezado se busca por contenido en vez de asumir un índice fijo, para
// tolerar pequeñas variaciones del mismo formato entre versiones del archivo.

export type Sheet = readonly (readonly unknown[])[]

export interface AnmRow {
  readonly cedula: string
  readonly firstName: string
  readonly lastName: string
  readonly age: number | null
  readonly email: string
  readonly organizationName: string
  readonly locationMunicipality: string
  readonly locationDepartment: string
}

export type ImportStatus = 'ok' | 'duplicate_in_file' | 'duplicate_in_db' | 'missing_required'
export type PreviewRow = AnmRow & { readonly status: ImportStatus; readonly message: string }

const HEADER_MARKER = normalize('DOCUMENTO DE IDENTIDAD')

// La fila de títulos tiene secciones en celdas combinadas: solo la primera columna de cada sección trae texto.
// "Carry-forward" reconstruye a qué sección pertenece cada columna.
const sectionTitles = (header: readonly unknown[]): readonly string[] =>
  header.reduce<readonly string[]>((acc, cell) => [...acc, normalize(cell) || (acc.at(-1) ?? '')], [])

// Columnas cuyo (título de sección + subencabezado) contiene TODOS los fragmentos: evita colisiones entre columnas
// con palabras en común ("NOMBRE" está en "NOMBRE(S) Y APELLIDOS" y en "EMPRESA ... NOMBRE").
const columnsWith = (titles: readonly string[], sub: readonly unknown[], parts: readonly string[]): readonly number[] =>
  sub.map((cell, i) => [i, `${titles[i] ?? ''} ${normalize(cell)}`] as const)
    .filter(([, text]) => parts.every((p) => text.includes(normalize(p))))
    .map(([i]) => i)

interface Columns {
  readonly cedula?: number
  readonly name?: number
  readonly age?: number
  readonly company?: number
  readonly municipality?: number
  readonly department?: number
  readonly email?: number
}

// Hay dos columnas "CORREO ELECTRÓNICO" (empresa y socorredor): la del socorredor viene después de las de residencia
const workerEmail = (emails: readonly number[], municipality: number | undefined) =>
  municipality === undefined ? emails.at(-1) : emails.find((c) => c > municipality)

const locate = (titles: readonly string[], sub: readonly unknown[]): Columns => {
  const first = (...parts: readonly string[]) => columnsWith(titles, sub, parts)[0]
  const municipality = first('MUNICIPIO DE RESIDENCIA')
  return {
    cedula: first('NUMERO'), name: first('NOMBRE(S)', 'APELLIDO'), age: first('EDAD'), company: first('EMPRESA', 'NOMBRE'),
    municipality, department: first('DEPARTAMENTO DE RESIDENCIA'),
    email: workerEmail(columnsWith(titles, sub, ['CORREO', 'ELECTRONICO']), municipality),
  }
}

const at = (row: readonly unknown[], col: number | undefined): string => (col === undefined ? '' : cellText(row[col]).trim())

/** "Pedro Pablo Pérez" → nombres "Pedro Pablo", apellido "Pérez" (la planilla trae el nombre completo en una celda). */
export const splitFullName = (full: string): { readonly firstName: string; readonly lastName: string } => {
  const parts = full.split(/\s+/).filter(Boolean)
  return parts.length < 2
    ? { firstName: parts[0] ?? '', lastName: '' }
    : { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) ?? '' }
}

const ageOf = (row: readonly unknown[], col: number | undefined): number | null =>
  col === undefined || row[col] === '' ? null : Number(row[col])

const toRow = (c: Columns) => (row: readonly unknown[]): AnmRow => ({
  cedula: at(row, c.cedula), ...splitFullName(at(row, c.name)), age: ageOf(row, c.age),
  // El correo NO es único (varios trabajadores comparten el de la empresa): la cédula es la identidad real
  email: at(row, c.email), organizationName: at(row, c.company),
  locationMunicipality: at(row, c.municipality), locationDepartment: at(row, c.department),
})

const missingColumns = (c: Columns): readonly string[] =>
  [c.cedula === undefined ? 'número de documento' : null, c.name === undefined ? 'nombre completo' : null]
    .filter((x): x is string => x !== null)

const rowsAfter = (sheet: Sheet, header: number): AnmRow[] => {
  // El encabezado viene partido en dos filas por las celdas combinadas (header y header + 1)
  const columns = locate(sectionTitles(sheet[header] ?? []), sheet[header + 1] ?? [])
  const missing = missingColumns(columns)
  if (missing.length > 0) throw new AnmColumnsMissingError(missing)
  // Las filas sin cédula son relleno del formato y se ignoran
  return sheet.slice(header + 2).map(toRow(columns)).filter((r) => r.cedula !== '')
}

const statusOf = (r: AnmRow, earlier: readonly AnmRow[], registered: ReadonlySet<string>): Pick<PreviewRow, 'status' | 'message'> =>
  r.firstName === '' ? { status: 'missing_required', message: 'Falta el nombre' }
    : earlier.some((prev) => prev.cedula === r.cedula) ? { status: 'duplicate_in_file', message: 'Cédula repetida en el archivo' }
      : registered.has(r.cedula) ? { status: 'duplicate_in_db', message: 'La cédula ya está registrada en el sistema' }
        : { status: 'ok', message: '' }

/** Lectura pura de la planilla ANM (sin consultar la BD). */
export class AnmSheet {
  private constructor(readonly rows: readonly AnmRow[]) {}

  /** Filas de datos de la primera hoja; sin encabezado o sin las columnas obligatorias, error de validación. */
  static read(sheet: Sheet): AnmSheet {
    const header = sheet.findIndex((row) => row.some((cell) => normalize(cell).includes(HEADER_MARKER)))
    if (header === -1) throw new AnmHeaderMissingError()
    return new AnmSheet(rowsAfter(sheet, header))
  }

  get cedulas(): string[] { return this.rows.map((r) => r.cedula) }

  /** Cada fila con su estado: nombre faltante, repetida en el archivo o ya registrada. */
  preview(registered: ReadonlySet<string>): PreviewRow[] {
    return this.rows.map((r, i) => ({ ...r, ...statusOf(r, this.rows.slice(0, i), registered) }))
  }
}
