import { validation, type DomainError } from '../../shared/errors'
import { err, ok, type Result } from '../../shared/result'
import { preview, readAnm, type PreviewRow } from './anm'
import { asText, PLAYER, type Fields } from './domain'
import { placeQuery } from './places'
import type { IdentityDeps } from './ports'

// Importación masiva desde el Excel ANM: vista previa sin escribir y confirmación fila por fila. Los
// importados siempre son jugadores, con usuario = cédula y una contraseña aleatoria que nunca se muestra.

type Outcome<T> = Promise<Result<T, DomainError>>

export type Created = {
  readonly cedula: string
  readonly userId: string
  readonly organizationCreated: string | null
  readonly locationCreated: string | null
  readonly locationNoMatch: string | null
}
export type Skipped = { readonly cedula: unknown; readonly reason: string }
export type ImportReport = { readonly created: readonly Created[]; readonly skipped: readonly Skipped[]; readonly errors: readonly Skipped[] }

type RowOutcome =
  | { readonly kind: 'created'; readonly entry: Created }
  | { readonly kind: 'skipped' | 'errors'; readonly entry: Skipped }

const EMPTY: ImportReport = { created: [], skipped: [], errors: [] }

const excelRequired = (): DomainError => validation('EXCEL_REQUIRED', 'El archivo Excel es requerido')
const rowsRequired = (): DomainError => validation('IMPORT_ROWS_REQUIRED', 'rows debe ser un arreglo no vacío')

const parse = (d: IdentityDeps) => async (file: Buffer | undefined): Outcome<readonly PreviewRow[]> => {
  if (file === undefined) return err(excelRequired())
  const rows = readAnm(d.spreadsheets.firstSheet(file))
  return rows.ok ? ok(preview(rows.value, await d.accounts.registeredCedulas(rows.value.map((r) => r.cedula)))) : rows
}

const text = (v: unknown): string => asText(v)?.trim() ?? ''
const placeLabel = (row: Fields) => `${text(row.location_municipality)}, ${text(row.location_department)}`

const organizationOf = async (d: IdentityDeps, name: string) =>
  name.trim() === '' ? { id: null, created: false } : d.directory.organization(name.trim())

const locationOf = async (d: IdentityDeps, row: Fields) => {
  const query = placeQuery(text(row.location_municipality), text(row.location_department))
  return query === null ? { id: null, created: false, noMatch: false } : { ...(await d.directory.location(query)), noMatch: query.noMatch }
}

const importedUser = async (d: IdentityDeps, cedula: string, row: Fields) => ({
  cedula, passwordHash: await d.passwords.hash(d.passwords.generate()),
  details: { first_name: row.first_name, last_name: row.last_name || '', age: row.age || null, email: row.email || null, role: PLAYER },
})

const createRow = async (d: IdentityDeps, cedula: string, row: Fields): Promise<RowOutcome> => {
  const org = await organizationOf(d, text(row.organization_name))
  const loc = await locationOf(d, row)
  const userId = await d.accounts.createImported(await importedUser(d, cedula, row), { organization_id: org.id, location_id: loc.id })
  return { kind: 'created', entry: {
    cedula, userId, organizationCreated: org.created ? text(row.organization_name) : null,
    locationCreated: loc.created ? placeLabel(row) : null, locationNoMatch: loc.noMatch ? placeLabel(row) : null,
  } }
}

const importRow = async (d: IdentityDeps, row: Fields): Promise<RowOutcome> => {
  const cedula = text(row.cedula)
  if (cedula === '' || !row.first_name) return { kind: 'skipped', entry: { cedula, reason: 'Datos incompletos' } }
  if (await d.accounts.cedulaExists(cedula)) return { kind: 'skipped', entry: { cedula, reason: 'Cédula ya registrada' } }
  return createRow(d, cedula, row)
}

// Una fila que falla no detiene las demás: queda en errors con el motivo
const safely = (d: IdentityDeps, row: Fields): Promise<RowOutcome> =>
  importRow(d, row).catch((e: unknown) =>
    ({ kind: 'errors', entry: { cedula: row.cedula, reason: e instanceof Error ? e.message : String(e) } }))

const add = (report: ImportReport, o: RowOutcome): ImportReport =>
  o.kind === 'created' ? { ...report, created: [...report.created, o.entry] } : { ...report, [o.kind]: [...report[o.kind], o.entry] }

const asFields = (v: unknown): Fields => (v !== null && typeof v === 'object' ? (v as Fields) : {})

// En orden y de a una fila: dos filas con la misma organización nueva no la crean dos veces
const confirm = (d: IdentityDeps) => async (rows: unknown): Outcome<ImportReport> =>
  Array.isArray(rows) && rows.length > 0
    ? ok(await rows.reduce<Promise<ImportReport>>(async (acc, row) => add(await acc, await safely(d, asFields(row))), Promise.resolve(EMPTY)))
    : err(rowsRequired())

export const makeBulkImport = (d: IdentityDeps) => ({ parseImport: parse(d), confirmImport: confirm(d) })
