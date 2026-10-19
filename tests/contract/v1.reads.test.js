import { createRequire } from 'node:module'
import { describe, it, expect, inject } from 'vitest'

const require = createRequire(import.meta.url)
const { send, contract } = require('../support/contract.cjs')

// Snapshot de contrato de cada GET de la API v1 con cada rol. Mientras v1 exista, estos snapshots
// no deben cambiar: si uno cambia a propósito, actualizarlo con `npm test -- -u` y explicarlo en el PR.
const s = inject('seed')
const [p1] = s.players
const ROLES = {
  anonimo: null,
  jugador: p1,
  instructor: s.instructor,
  desarrollador: s.developer,
  admin: s.admin,
}

// [plantilla mostrada en el snapshot, URL real]
const ROUTES = [
  ['/', '/'],
  ['/health', '/health'],
  ['/api/health', '/api/health'],
  ['/api/no-existe', '/api/no-existe'],
  ['/api/health/details', '/api/health/details'],
  ['/api/analytics/overview', '/api/analytics/overview'],
  ['/api/analytics/organization/:orgId', `/api/analytics/organization/${s.org.id}`],
  ['/api/analytics/location?department', '/api/analytics/location?department=Norte%20de%20Santander'],
  ['/api/analytics/map', '/api/analytics/map'],
  ['/api/levels', '/api/levels'],
  ['/api/levels/:id', '/api/levels/1'],
  ['/api/levels/:id (no existe)', '/api/levels/999'],
  ['/api/locations/search?municipality', '/api/locations/search?municipality=C%C3%BAcuta'],
  ['/api/locations/:id', `/api/locations/${s.location.id}`],
  ['/api/organizations', '/api/organizations'],
  ['/api/organizations/search?name', '/api/organizations/search?name=Mina'],
  ['/api/organizations/types', '/api/organizations/types'],
  ['/api/organizations/:id', `/api/organizations/${s.org.id}`],
  ['/api/progress/full', '/api/progress/full'],
  ['/api/progress/me/:sessionId', `/api/progress/me/${s.session.id}`],
  ['/api/progress/level/:levelId', '/api/progress/level/1'],
  ['/api/progress/user/:userId/history', `/api/progress/user/${p1.id}/history`],
  ['/api/sessions/code/:code', `/api/sessions/code/${s.session.code}`],
  ['/api/sessions/mine', '/api/sessions/mine'],
  ['/api/sessions/all', '/api/sessions/all'],
  ['/api/sessions/by-location?department', '/api/sessions/by-location?department=Norte%20de%20Santander'],
  ['/api/sessions/:id/progress', `/api/sessions/${s.session.id}/progress`],
  ['/api/sessions/:id/progress/admin', `/api/sessions/${s.session.id}/progress/admin`],
  ['/api/sessions/:id/participants/:userId/analysis', `/api/sessions/${s.session.id}/participants/${p1.id}/analysis`],
  ['/api/telemetry/me/attempts', '/api/telemetry/me/attempts'],
  ['/api/telemetry/overview', '/api/telemetry/overview'],
  ['/api/telemetry/overview?session_id', `/api/telemetry/overview?session_id=${s.session.id}`],
  ['/api/telemetry/users/:userId/attempts', `/api/telemetry/users/${p1.id}/attempts`],
  ['/api/telemetry/users/:userId/summary', `/api/telemetry/users/${p1.id}/summary`],
  ['/api/telemetry/attempts/:id', `/api/telemetry/attempts/${s.attempts[1]}`],
  ['/api/users', '/api/users'],
  ['/api/users?role=player', '/api/users?role=player'],
  ['/api/users/:id', `/api/users/${p1.id}`],
  ['/api/users/:id/sessions', `/api/users/${p1.id}/sessions`],
  ['/api/vark/me', '/api/vark/me'],
  ['/api/vark/all', '/api/vark/all'],
  ['/api/vark/by-style/:style', '/api/vark/by-style/Visual'],
  ['/api/vark/by-location?department', '/api/vark/by-location?department=Norte%20de%20Santander'],
  ['/api/visits/stats', '/api/visits/stats?days=7'],
  ['/api/deploy/status', '/api/deploy/status'],
  ['/api/deploy/versions', '/api/deploy/versions'],
]

describe.each(Object.entries(ROLES))('v1 GET como %s', (role, who) => {
  it.each(ROUTES)('%s', async (_, url) => {
    expect(contract(await send('get', url, who))).toMatchSnapshot()
  })
})

// El catálogo de localidades tiene 1104 municipios: basta con una vez y sin rol
it('v1 GET /api/locations', async () => {
  const res = await send('get', '/api/locations', null)
  expect(contract(res)).toMatchSnapshot()
  expect(res.body.length).toBeGreaterThan(1000)
})

// Excel de la sesión: hojas, encabezados y número de filas (los valores cambian con las fechas)
it('v1 GET /api/sessions/:id/export.xlsx', async () => {
  const ExcelJS = require('exceljs')
  const res = await send('get', `/api/sessions/${s.session.id}/export.xlsx`, s.instructor)
    .buffer(true).parse((r, cb) => { const c = []; r.on('data', d => c.push(d)); r.on('end', () => cb(null, Buffer.concat(c))) })
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(res.body)
  const sheets = book.worksheets.map(ws => ({
    name: ws.name,
    rows: ws.rowCount,
    headers: ws.getRow(ws.views?.[0]?.ySplit || 1).values.filter(v => typeof v === 'string'),
  }))
  expect({ status: res.status, type: res.headers['content-type'], sheets }).toMatchSnapshot()
})
