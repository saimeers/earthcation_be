import {
  AnmSheet, ExcelRequiredError, type PreviewRow, type SpreadsheetReader, type UserRepository,
} from '@earthcation/model'

export interface PreviewBulkImportCommand {
  /** El archivo subido; undefined si no vino. */
  readonly file: Uint8Array | undefined
}

export interface PreviewBulkImportDeps {
  readonly spreadsheets: SpreadsheetReader
  readonly users: UserRepository
}

/** Lee la planilla ANM y marca cada fila (nueva, repetida, ya registrada, sin nombre) SIN escribir en la BD. */
export class PreviewBulkImportUseCase {
  constructor(private readonly deps: PreviewBulkImportDeps) {}

  async execute(cmd: PreviewBulkImportCommand): Promise<PreviewRow[]> {
    if (cmd.file === undefined) throw new ExcelRequiredError()
    const sheet = AnmSheet.read(this.deps.spreadsheets.firstSheet(cmd.file))
    return sheet.preview(await this.deps.users.registeredCedulas(sheet.cedulas))
  }
}
