import { createRequire } from 'node:module'
import { describe, it, expect, inject } from 'vitest'

const require = createRequire(import.meta.url)
const ExcelJS = require('exceljs')
const { send, contract } = require('../support/contract.cjs')

// Sesiones: VALORES del detalle para el panel, el análisis por participante y el Excel sobre la semilla fija
// (ids, fechas y el código de sala cambian en cada corrida y se enmascaran), más casos borde sin escritura.
const s = inject('seed')
const [p1, , p3] = s.players

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2}))?$/
const VOLATILE = new Set(['code', 'week', 'day'])

const stable = (v, key = '') => {
  if (Array.isArray(v)) return v.map((x) => stable(x))
  if (v instanceof Date) return '<date>'
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [UUID.test(k) ? '<uuid>' : k, stable(v[k], k)]))
  if (typeof v === 'string' && UUID.test(v)) return '<uuid>'
  if (typeof v === 'string' && ISO.test(v)) return '<date>'
  if (VOLATILE.has(key) && v !== null) return `<${key}>`
  return v
}

const golden = async (url, who) => {
  const res = await send('get', url, who)
  expect(res.status).toBe(200)
  expect(stable(res.body)).toMatchSnapshot()
  return res.body
}

const freeSessionId = async () =>
  (await send('get', `/api/telemetry/attempts/${s.freeAttempt}`, s.admin)).body.attempt.session_id

describe('valores de las lecturas de sesiones', () => {
  it('detalle para el panel', () => golden(`/api/sessions/${s.session.id}/progress/admin`, s.admin))
  it('análisis de un participante', () => golden(`/api/sessions/${s.session.id}/participants/${p1.id}/analysis`, s.instructor))
  it('progreso para el instructor dueño', () => golden(`/api/sessions/${s.session.id}/progress`, s.instructor))
  it('mis sesiones (incluye el Juego libre de la localidad)', async () => {
    const mine = await golden('/api/sessions/mine', s.instructor)
    expect(mine.some((x) => x.is_free_play)).toBe(true)
  })
  it('por localidad y todas', async () => {
    await golden('/api/sessions/by-location?department=Norte%20de%20Santander&municipality=C%C3%BAcuta', s.admin)
    await golden('/api/sessions/all', s.admin)
  })
  it('Juego libre: el instructor de la localidad la ve', async () => golden(`/api/sessions/${await freeSessionId()}/progress/admin`, s.instructor))
  it('sala por código', () => golden(`/api/sessions/code/${s.session.code}`, p3))
})

// Excel: valor de cada celda de cada hoja (fechas, código de sala y "Generado el" enmascarados)
describe('Excel de la sesión', () => {
  it('celdas de todas las hojas', async () => {
    const res = await send('get', `/api/sessions/${s.session.id}/export.xlsx`, s.instructor)
      .buffer(true).parse((r, cb) => { const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))) })
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="sesion-\d{3}-\d{4}-\d{2}-\d{2}\.xlsx"$/)
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(res.body)
    const cells = (ws) => ws.getSheetValues().filter(Boolean).map((row) => row.slice(1).map((v) => stable(v)))
    const sheets = Object.fromEntries(book.worksheets.map((ws) => [ws.name, cells(ws)]))
    sheets.Resumen[1] = ['<generado>']
    sheets.Resumen = sheets.Resumen.map((row) => (row[0] === 'Código de sala' ? [row[0], '<code>'] : row))
    expect(sheets).toMatchSnapshot()
  })
})

describe('casos borde sin escritura', () => {
  const missing = '00000000-0000-0000-0000-000000000000'
  const snap = async (res) => expect(contract(await res)).toMatchSnapshot()

  it('Juego libre no se inicia ni se termina', async () => {
    const id = await freeSessionId()
    await snap(send('patch', `/api/sessions/${id}/start`, s.instructor))
    await snap(send('patch', `/api/sessions/${id}/end`, s.instructor))
  })
  it('solo el instructor dueño inicia su sala', () => snap(send('patch', `/api/sessions/${s.session.id}/start`, s.admin)))
  it('código de sala mal formado o inexistente', async () => {
    await snap(send('get', '/api/sessions/code/12a', p1))
    await snap(send('get', '/api/sessions/code/999', p1))
  })
  it('análisis de quien no participa y sesión inexistente', async () => {
    await snap(send('get', `/api/sessions/${s.session.id}/participants/${p3.id}/analysis`, s.admin))
    await snap(send('get', `/api/sessions/${missing}/progress/admin`, s.admin))
    await snap(send('get', `/api/sessions/${missing}/progress`, s.instructor))
  })
  it('crear sin nombre o sin localidad', async () => {
    await snap(send('post', '/api/sessions', s.instructor, { location_id: s.location.id }))
    await snap(send('post', '/api/sessions', s.instructor, { name: 'Sin localidad' }))
  })
})
