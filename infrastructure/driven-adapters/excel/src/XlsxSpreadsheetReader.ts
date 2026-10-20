import * as XLSX from 'xlsx'
import type { Sheet, SpreadsheetReader } from '@earthcation/model'

/** Lee la primera hoja con SheetJS: una fila por arreglo, celdas vacías como ''. */
export class XlsxSpreadsheetReader implements SpreadsheetReader {
  firstSheet(file: Uint8Array): Sheet {
    const book = XLSX.read(file, { type: 'buffer' })
    const sheet = book.Sheets[book.SheetNames[0] ?? '']
    return sheet ? XLSX.utils.sheet_to_json<readonly unknown[]>(sheet, { header: 1, defval: '' }) : []
  }
}
