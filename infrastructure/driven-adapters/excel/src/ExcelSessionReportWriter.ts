/* eslint-disable no-param-reassign -- ExcelJS se configura asignando propiedades a hojas y celdas */
import ExcelJS from 'exceljs'
import {
  attemptRows, BANDS, keyOf, participantRows, resultRows, riskRows, summaryLines,
  type InfoLine, type Row, type SessionDetail, type SessionReportWriter, type SessionRow,
} from '@earthcation/model'

// Adaptador de ExcelJS: dibuja las filas de `report.ts` (model) con el encabezado de marca, fila congelada,
// autofiltro y celdas teñidas por resultado. Hojas: Resumen, Participantes, Riesgos de la sesión, Resultados
// por riesgo, Intentos por nivel.

// Paleta del panel (morado de marca + semáforo de desempeño), en ARGB
const BRAND = 'FF7C3AED'
const HEADER_TEXT = 'FFFFFFFF'
type Tint = 'good' | 'warn' | 'bad' | 'neutral'
const TINTS: Readonly<Record<Tint, { readonly fill: string; readonly font: string }>> = {
  good: { fill: 'FFDCFCE7', font: 'FF166534' }, warn: { fill: 'FFFEF3C7', font: 'FF92400E' },
  bad: { fill: 'FFFEE2E2', font: 'FF991B1B' }, neutral: { fill: 'FFF1F5F9', font: 'FF475569' },
}
const BAND_TINT: Readonly<Record<string, Tint>> = { destacado: 'good', en_progreso: 'warn', refuerzo: 'bad', sin_datos: 'neutral' }
const OUTCOME_TINT: Readonly<Record<string, Tint>> = { completed: 'good', failed: 'bad', abandoned: 'warn', in_progress: 'neutral' }

type Column = { readonly header: string; readonly key: string; readonly width?: number; readonly numFmt?: string }

const tint = (cell: ExcelJS.Cell, kind: Tint | undefined) => {
  if (!kind) return
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TINTS[kind].fill } }
  cell.font = { ...cell.font, bold: true, color: { argb: TINTS[kind].font } }
}

const brandHeader = (ws: ExcelJS.Worksheet) => {
  const header = ws.getRow(1)
  header.height = 22
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } }
    cell.font = { bold: true, color: { argb: HEADER_TEXT } }
    cell.alignment = { vertical: 'middle', wrapText: true }
  })
}

// Hoja con encabezado de marca, fila congelada y anchos fijos
const emptyTable = (wb: ExcelJS.Workbook, name: string, columns: readonly Column[]) => {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 14, style: c.numFmt ? { numFmt: c.numFmt } : {} }))
  brandHeader(ws)
  return ws
}

const tableSheet = (wb: ExcelJS.Workbook, name: string, columns: readonly Column[]) =>
  (rowsData: readonly Row[], onRow: (row: ExcelJS.Row, data: Row) => void) => {
    const ws = emptyTable(wb, name, columns)
    rowsData.forEach((r) => {
      const row = ws.addRow(r)
      row.alignment = { vertical: 'middle' }
      onRow(row, r)
    })
    if (rowsData.length > 0) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }
  }

// ── Resumen ──────────────────────────────────────────────────────────────────

const bandOf = (label: string) => Object.entries(BANDS).find(([, name]) => label.endsWith(name))?.[0]

const styleValue = (cell: ExcelJS.Cell, label: string, value: unknown) => {
  cell.alignment = { horizontal: 'left' }
  if (value instanceof Date) cell.numFmt = 'dd/mm/yyyy hh:mm'
  if (/Mitigación promedio|Tasa de/.test(label) && typeof value === 'number') cell.numFmt = '0%'
}

const writeLine = (ws: ExcelJS.Worksheet, line: Exclude<InfoLine, null>, r: number) => {
  const [label, value] = line
  ws.getCell(`A${r}`).value = label
  ws.getCell(`A${r}`).font = { bold: true, color: { argb: 'FF334155' } }
  ws.getCell(`B${r}`).value = value as ExcelJS.CellValue
  styleValue(ws.getCell(`B${r}`), label, value)
  if (label.startsWith('Desempeño:')) tint(ws.getCell(`A${r}`), BAND_TINT[bandOf(label) ?? ''])
}

const title = (ws: ExcelJS.Worksheet, name: string, now: Date) => {
  ws.mergeCells('A1:B1')
  ws.getCell('A1').value = `Informe de sesión — ${name}`
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: BRAND } }
  ws.getRow(1).height = 28
  ws.getCell('A2').value = `Generado el ${now.toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`
  ws.getCell('A2').font = { italic: true, color: { argb: 'FF64748B' } }
}

const summarySheet = (wb: ExcelJS.Workbook, d: SessionDetail, now: Date) => {
  const ws = wb.addWorksheet('Resumen')
  ws.columns = [{ width: 32 }, { width: 44 }]
  title(ws, keyOf(d.session.name), now)
  summaryLines(d).forEach((line, i) => { if (line) writeLine(ws, line, 4 + i) })
}

// ── Tablas ───────────────────────────────────────────────────────────────────

const PARTICIPANT_COLUMNS: readonly Column[] = [
  { header: 'Cédula', key: 'cedula' }, { header: 'Nombre', key: 'nombre', width: 28 }, { header: 'Organización', key: 'org', width: 24 },
  { header: 'Estilo VARK', key: 'vark', width: 16 }, { header: 'Desempeño', key: 'band', width: 18 },
  { header: '% Mitigación', key: 'pct', width: 13, numFmt: '0%' }, { header: 'Riesgos evaluados', key: 'total', width: 12 },
  { header: 'Mitigados', key: 'mitigated', width: 11 }, { header: 'Errores', key: 'mistakes', width: 10 },
  { header: 'Reacción prom. (s)', key: 'reaction', width: 13, numFmt: '0.0' }, { header: 'Intentos de nivel', key: 'attempts', width: 11 },
  { header: 'Completados', key: 'completed', width: 12 }, { header: 'Fallidos', key: 'failed', width: 10 },
  { header: 'Abandonados', key: 'abandoned', width: 12 }, { header: 'Mejor tiempo', key: 'best', width: 12, numFmt: '[m]:ss' },
  { header: 'Riesgo más débil', key: 'weakest', width: 34 }, { header: 'Causa de fallo más común', key: 'cause', width: 26 },
]

const RISK_COLUMNS: readonly Column[] = [
  { header: 'Código', key: 'id', width: 10 }, { header: 'Riesgo', key: 'name', width: 40 }, { header: 'Categoría', key: 'cat', width: 16 },
  { header: 'Nivel', key: 'level', width: 22 }, { header: 'Resultados', key: 'results', width: 11 }, { header: 'Mitigados', key: 'mitigated', width: 11 },
  { header: 'Fallidos', key: 'failed', width: 10 }, { header: '% Fallo', key: 'rate', width: 10, numFmt: '0%' },
  { header: 'Errores', key: 'mistakes', width: 10 }, { header: 'Reacción prom. (s)', key: 'reaction', width: 13, numFmt: '0.0' },
]

const RESULT_COLUMNS: readonly Column[] = [
  { header: 'Cédula', key: 'cedula' }, { header: 'Nombre', key: 'nombre', width: 28 }, { header: 'Nivel', key: 'level', width: 22 },
  { header: 'Código', key: 'id', width: 10 }, { header: 'Riesgo', key: 'name', width: 40 }, { header: 'Categoría', key: 'cat', width: 16 },
  { header: 'Resultado', key: 'result', width: 12 }, { header: 'Errores', key: 'mistakes', width: 10 },
  { header: 'Reacción (s)', key: 'reaction', width: 12, numFmt: '0.0' }, { header: 'Fecha', key: 'date', width: 18, numFmt: 'dd/mm/yyyy hh:mm' },
]

const ATTEMPT_COLUMNS: readonly Column[] = [
  { header: 'Cédula', key: 'cedula' }, { header: 'Nombre', key: 'nombre', width: 28 }, { header: 'Nivel', key: 'level', width: 10 },
  { header: 'N.º intento', key: 'n', width: 10 }, { header: 'Resultado', key: 'outcome', width: 13 }, { header: 'Causa de fallo', key: 'reason', width: 24 },
  { header: 'Etapa', key: 'stage', width: 24 }, { header: 'Duración', key: 'duration', width: 10, numFmt: '[m]:ss' },
  { header: 'Vida final', key: 'health', width: 10 }, { header: 'Detector', key: 'brand', width: 20 }, { header: 'Calibrado', key: 'calibrated', width: 10 },
  { header: 'Inicio', key: 'start', width: 18, numFmt: 'dd/mm/yyyy hh:mm' },
]

const rateTint = (rate: unknown): Tint => (typeof rate === 'number' && rate >= 0.5 ? 'bad' : typeof rate === 'number' && rate >= 0.2 ? 'warn' : 'good')

const tables = (wb: ExcelJS.Workbook, d: SessionDetail, attempts: readonly SessionRow[]) => {
  tableSheet(wb, 'Participantes', PARTICIPANT_COLUMNS)(participantRows(d.participants), (row, r) => { tint(row.getCell('band'), BAND_TINT[keyOf(r._band)]) })
  tableSheet(wb, 'Riesgos de la sesión', RISK_COLUMNS)(riskRows(d.risks), (row, r) => { tint(row.getCell('rate'), rateTint(r.rate)) })
  tableSheet(wb, 'Resultados por riesgo', RESULT_COLUMNS)(resultRows(d.participants), (row, r) => { tint(row.getCell('result'), r._ok ? 'good' : 'bad') })
  tableSheet(wb, 'Intentos por nivel', ATTEMPT_COLUMNS)(attemptRows(attempts), (row, r) => { tint(row.getCell('outcome'), OUTCOME_TINT[keyOf(r._outcome)]) })
}

/** Escritor de sesiones con ExcelJS (SheetJS CE no permite estilos). */
export class ExcelSessionReportWriter implements SessionReportWriter {
  async write(detail: SessionDetail, attempts: readonly SessionRow[], now: Date): Promise<Buffer> {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Earthcation'
    wb.created = now
    summarySheet(wb, detail, now)
    tables(wb, detail, attempts)
    return Buffer.from(await wb.xlsx.writeBuffer())
  }
}
