import { createRequire } from 'node:module'
import { describe, it, expect, inject } from 'vitest'

const require = createRequire(import.meta.url)
const AdmZip = require('adm-zip')
const XLSX = require('xlsx')
const request = require('supertest')
const { send, app } = require('../support/contract.cjs')
const { tokenFor } = require('../support/auth.cjs')

// API v1: despliegue del juego (almacenamiento local), visitas, salud e importación masiva contra Postgres real.
const s = inject('seed')
const dev = s.developer

const webglZip = () => {
  const zip = new AdmZip()
  zip.addFile('MiBuild/index.html', Buffer.from('<script>createUnityInstance(c, { productVersion: "3.0.1" })</script>'))
  for (const f of ['x.loader.js', 'x.framework.js.br', 'x.wasm.br', 'x.data.br']) zip.addFile(`MiBuild/Build/${f}`, Buffer.from(f))
  return zip.toBuffer()
}

const putZip = (id, body, who = dev) => request(app).put(`/api/v1/game-versions/${id}/upload`)
  .set('Authorization', `Bearer ${tokenFor(who)}`).set('Content-Type', 'application/zip').send(body)

const settled = async (id) => {
  for (let i = 0; i < 100; i++) {
    const list = (await send('get', '/api/v1/game-versions?limit=100', dev)).body.data
    const v = list.find((x) => x.id === id)
    if (v.status !== 'processing') return v
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error('la publicación no terminó')
}

describe('API v1: despliegue del juego', () => {
  const zip = webglZip()
  const version = {}

  it('solo admin y desarrollador despliegan', async () => {
    expect((await send('get', '/api/v1/game-versions', s.instructor)).status).toBe(403)
    expect((await send('get', '/api/v1/game-versions/status', null)).status).toBe(401)
    expect((await send('get', '/api/v1/game-versions/status', dev)).body.data).toHaveProperty('playUrl')
  })

  it('crear versión: 201, Location, destino de subida y notas recortadas', async () => {
    const res = await send('post', '/api/v1/game-versions', dev, { label: '3.0.1', sizeBytes: zip.length, notes: '  Notas v1  ' })
    expect(res.status).toBe(201)
    expect(res.headers.location).toBe(`/api/v1/game-versions/${res.body.data.version.id}`)
    expect(res.body.data.version).toMatchObject({ label: '3.0.1', status: 'uploading', notes: 'Notas v1' })
    expect(res.body.data.upload).toEqual({
      mode: 'api', method: 'PUT', url: `/api/v1/game-versions/${res.body.data.version.id}/upload`, headers: { 'Content-Type': 'application/zip' },
    })
    expect(JSON.stringify(res.body)).not.toMatch(/s3Key|originalKey|publishedPrefix/)
    version.id = res.body.data.version.id
    expect((await send('post', '/api/v1/game-versions', dev, { label: '' })).body.error.code).toBe('VALIDATION_ERROR')
  })

  it('editar la nota: tildes intactas, vacío la borra, 403 a un instructor y 404 si no existe', async () => {
    const url = `/api/v1/game-versions/${version.id}`
    const edited = await send('patch', url, dev, { notes: 'Iluminación de la mina y multigás' })
    expect([edited.status, edited.body.data.notes, edited.body.data.status]).toEqual([200, 'Iluminación de la mina y multigás', 'uploading'])
    const listed = (await send('get', '/api/v1/game-versions?limit=100', dev)).body.data.find((v) => v.id === version.id)
    expect(listed.notes).toBe('Iluminación de la mina y multigás')
    expect((await send('patch', url, dev, { notes: null })).body.data.notes).toBeNull()
    expect((await send('patch', url, s.instructor, { notes: 'x' })).status).toBe(403)
    expect((await send('patch', url.replace(version.id, '00000000-0000-4000-8000-000000000000'), dev, { notes: 'x' })).status).toBe(404)
    await send('patch', url, dev, { notes: 'Notas v1' })
  })

  it('sube el ZIP, completa y publica en segundo plano', async () => {
    expect((await putZip(version.id, zip)).status).toBe(204)
    const done = await send('post', `/api/v1/game-versions/${version.id}/completion`, dev)
    expect([done.status, done.body.data.status]).toEqual([200, 'processing'])
    const ready = await settled(version.id)
    expect(ready).toMatchObject({ status: 'ready', error: null, isActive: false })
    expect(ready.manifest).toMatchObject({ root: 'MiBuild/', compression: 'brotli', productVersion: '3.0.1' })
    expect(new Date(ready.createdAt).toISOString()).toBe(ready.createdAt)
  })

  it('vista previa, activación y una versión activa no se borra', async () => {
    const preview = await send('get', `/api/v1/game-versions/${version.id}/preview-url`, dev)
    expect(preview.body.data.url).toContain(`/play-local/v/${version.id}/`)
    const active = await send('post', `/api/v1/game-versions/${version.id}/activation`, dev)
    expect([active.status, active.body.data.activatedAt]).toEqual([200, expect.any(String)])
    expect((await send('get', '/api/v1/game-versions/status', dev)).body.data.active).toMatchObject({ id: version.id })
    expect((await send('delete', `/api/v1/game-versions/${version.id}`, dev)).status).toBeGreaterThanOrEqual(409)
  })

  it('un id que no es UUID es 400 y una versión inexistente 404', async () => {
    expect((await send('post', '/api/v1/game-versions/abc/activation', dev)).body.error.code).toBe('VALIDATION_ERROR')
    expect((await send('post', '/api/v1/game-versions/00000000-0000-4000-8000-000000000000/activation', dev)).status).toBe(404)
  })

  it('el OpenAPI documenta el ZIP como cuerpo binario', async () => {
    const doc = await send('get', '/api/v1/openapi.json')
    const body = doc.body.paths['/game-versions/{id}/upload'].put.requestBody
    expect(Object.keys(body.content)).toEqual(['application/zip'])
  })
})

describe('API v1: visitas y salud', () => {
  const CHROME = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36'
  const ingest = (visit, secret = process.env.VISITS_INGEST_SECRET) =>
    request(app).post('/api/v1/visits').set('x-ingest-secret', secret).send(visit)

  it('la ingesta pide el secreto del Worker, no un token', async () => {
    expect((await send('post', '/api/v1/visits', null, { visitor: 'a' })).status).toBe(401)
    expect((await ingest({ visitor: 'a' }, 'otro-secreto')).status).toBe(401)
  })

  it('registra visitas en camelCase y las estadísticas las cuentan', async () => {
    const human = { visitor: 'd'.repeat(64), country: 'CO', city: 'Cúcuta', asn: 27951, asOrganization: 'Media Commerce', userAgent: CHROME, latitude: 7.89, longitude: -72.5 }
    expect((await ingest(human)).status).toBe(204)
    expect((await ingest({ visitor: 'e'.repeat(64), userAgent: 'curl/8.0' })).status).toBe(204)
    const stats = await send('get', '/api/v1/visits/stats?days=30', s.admin)
    expect(stats.status).toBe(200)
    expect(stats.body.data.totals.visits).toBeGreaterThanOrEqual(1)
    expect(Object.keys(stats.body.data.totals).sort()).toEqual(['bots', 'unique', 'viaQr', 'visitors', 'visits'])
    expect((await send('get', '/api/v1/visits/stats', s.instructor)).status).toBe(403)
  })

  it('salud pública mínima y detalle solo para admin y desarrollador', async () => {
    const pub = await send('get', '/api/v1/health')
    expect([pub.status, pub.body.data.status]).toEqual([200, 'ok'])
    expect(Object.keys(pub.body.data).sort()).toEqual(['status', 'uptimeS', 'version'])
    const details = await send('get', '/api/v1/health/details', dev)
    expect(details.body.data).toMatchObject({ status: 'ok' })
    expect(details.body.data.metrics).toBeDefined()
    expect((await send('get', '/api/v1/health/details', s.instructor)).status).toBe(403)
  })
})

const anmWorkbook = (rows) => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['BASE DE DATOS ANUAL DE PERSONAL CAPACITADO'],
    ['DOCUMENTO DE IDENTIDAD', '', 'NOMBRE(S) Y APELLIDOS', 'EDAD', 'EMPRESA', '', 'DATOS DEL SOCORREDOR', '', ''],
    ['TIPO', 'NÚMERO', '', '', 'NOMBRE', 'CORREO\r\nELECTRÓNICO', 'MUNICIPIO DE RESIDENCIA', 'DEPARTAMENTO DE RESIDENCIA', 'CORREO ELECTRONICO'],
    ...rows,
  ])
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Hoja1')
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })
}

const preview = (file, who = s.admin) => request(app).post('/api/v1/user-imports/previews')
  .set('Authorization', `Bearer ${tokenFor(who)}`).attach('file', file, 'anm.xlsx')

describe('API v1: importación masiva', () => {
  it('la vista previa marca el estado de cada fila, en camelCase', async () => {
    const res = await preview(anmWorkbook([
      ['CC', '60000001', 'Ana Lucía Gómez', 33, 'Mina V1 SAS', 'v1@x.co', 'Cucuta', 'Norte de Santander', 'ana@x.co'],
      ['CC', '60000001', 'Repetida', '', '', '', '', '', ''],
      ['CC', s.players[0].cedula, 'Ya Existe', '', '', '', '', '', ''],
    ]))
    expect(res.status).toBe(200)
    expect(res.body.data.map((r) => r.status)).toEqual(['ok', 'duplicate_in_file', 'duplicate_in_db'])
    expect(res.body.data[0]).toMatchObject({ firstName: 'Ana Lucía', lastName: 'Gómez', organizationName: 'Mina V1 SAS', locationMunicipality: 'Cucuta' })
  })

  it('sin archivo es 400 y un jugador no importa', async () => {
    const none = await request(app).post('/api/v1/user-imports/previews').set('Authorization', `Bearer ${tokenFor(s.admin)}`)
    expect([none.status, none.body.error.code]).toEqual([400, 'VALIDATION_ERROR'])
    expect((await preview(anmWorkbook([]), s.players[0])).status).toBe(403)
  })

  it('confirmar crea, reutiliza el catálogo y reporta los omitidos', async () => {
    const res = await send('post', '/api/v1/user-imports', s.admin, { rows: [
      { cedula: '60000002', firstName: 'Luz', lastName: 'Mar', age: 30, organizationName: 'mina v1 nueva', locationMunicipality: 'CUCUTA', locationDepartment: 'Norte de Santender' },
      { cedula: s.players[0].cedula, firstName: 'Ya Existe' },
    ] })
    expect(res.status).toBe(201)
    expect(res.body.data.created).toHaveLength(1)
    expect(res.body.data.created[0]).toMatchObject({ cedula: '60000002', organizationCreated: 'mina v1 nueva', locationCreated: null })
    expect(res.body.data.skipped.map((x) => x.reason)).toEqual(['Cédula ya registrada'])
    expect((await send('post', '/api/v1/user-imports', s.admin, { rows: [] })).body.error.code).toBe('VALIDATION_ERROR')
  })
})
