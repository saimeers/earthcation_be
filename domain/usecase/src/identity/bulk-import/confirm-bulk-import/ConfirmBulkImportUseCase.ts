import {
  Cedula, formText, ImportRowsRequiredError, User,
  type ImportDirectory, type PasswordGenerator, type PasswordHasher, type PlaceMatcher, type UserRepository,
} from '@earthcation/model'
import type { ConfirmBulkImportCommand, ImportedEntry, ImportReport, ImportRowInput } from './ConfirmBulkImportCommand'

export interface ConfirmBulkImportDeps {
  readonly users: UserRepository
  readonly directory: ImportDirectory
  readonly places: PlaceMatcher
  readonly passwords: PasswordHasher
  readonly generator: PasswordGenerator
}

interface Resolved {
  readonly id: string | null
  readonly created: string | null
  readonly noMatch: string | null
}

const NONE: Resolved = { id: null, created: null, noMatch: null }

const text = (v: unknown): string => formText(v) ?? ''
const placeLabel = (row: ImportRowInput): string => `${text(row.locationMunicipality)}, ${text(row.locationDepartment)}`

/**
 * Crea las cuentas de la planilla ANM: siempre jugadores, con usuario = cédula y una contraseña aleatoria que nunca se
 * muestra. Organización y localidad se encuentran o se crean; una fila que falla no detiene las demás.
 */
export class ConfirmBulkImportUseCase {
  constructor(private readonly deps: ConfirmBulkImportDeps) {}

  async execute(cmd: ConfirmBulkImportCommand): Promise<ImportReport> {
    if (cmd.rows.length === 0) throw new ImportRowsRequiredError()
    const report: ImportReport = { created: [], skipped: [], errors: [] }
    // En orden y de a una fila: dos filas con la misma organización nueva no la crean dos veces
    for (const row of cmd.rows) await this.importSafely(row, report)
    return report
  }

  private async importSafely(row: ImportRowInput, report: ImportReport): Promise<void> {
    try {
      await this.importRow(row, report)
    } catch (e) {
      report.errors.push({ cedula: row.cedula, reason: e instanceof Error ? e.message : String(e) })
    }
  }

  private async importRow(row: ImportRowInput, report: ImportReport): Promise<void> {
    const cedula = Cedula.from(row.cedula)
    if (!cedula || !row.firstName) report.skipped.push({ cedula: text(row.cedula), reason: 'Datos incompletos' })
    else if (await this.deps.users.cedulaExists(cedula.value)) report.skipped.push({ cedula: cedula.value, reason: 'Cédula ya registrada' })
    else report.created.push(await this.create(cedula, row))
  }

  private async create(cedula: Cedula, row: ImportRowInput): Promise<ImportedEntry> {
    const organization = await this.organizationOf(row)
    const location = await this.locationOf(row)
    const draft = User.imported(cedula, row, { organizationId: organization.id, locationId: location.id })
    const passwordHash = await this.deps.passwords.hash(this.deps.generator.generate())
    const userId = await this.deps.users.create(draft, { passwordHash, resetToken: null })
    const [organizationCreated, locationCreated, locationNoMatch] = [organization.created, location.created, location.noMatch]
    return { cedula: cedula.value, userId, organizationCreated, locationCreated, locationNoMatch }
  }

  private async organizationOf(row: ImportRowInput): Promise<Resolved> {
    const name = formText(row.organizationName)
    if (name === null) return NONE
    const entry = await this.deps.directory.organization(name)
    return { id: entry.id, created: entry.created ? name : null, noMatch: null }
  }

  private async locationOf(row: ImportRowInput): Promise<Resolved> {
    const query = this.deps.places.query(text(row.locationMunicipality), text(row.locationDepartment))
    if (query === null) return NONE
    const entry = await this.deps.directory.location(query)
    const label = placeLabel(row)
    return { id: entry.id, created: entry.created ? label : null, noMatch: query.noMatch ? label : null }
  }
}
