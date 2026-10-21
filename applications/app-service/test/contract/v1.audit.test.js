import { createRequire } from 'node:module'
import { describe, it, expect, inject } from 'vitest'

const require = createRequire(import.meta.url)
const request = require('supertest')
const { send, app } = require('../support/contract.cjs')
const { sequelize } = require('../../dist/container')

// Registro de auditoría contra Postgres real: las acciones sensibles dejan su rastro con quién y desde dónde, tanto por
// la API legacy como por la v1, sin datos personales, y la tabla no admite cambios.
const s = inject('seed')
const [p1] = s.players

const logs = async (query = '') => (await send('get', `/api/v1/audit-logs?limit=100${query}`, s.admin)).body.data
const find = (rows, action, targetId) => rows.find((r) => r.action === action && (targetId === undefined || r.targetId === targetId))

describe('registro de auditoría', () => {
  it('crear un usuario deja quién lo hizo, sobre quién y qué campos, sin datos personales', async () => {
    const created = await send('post', '/api/v1/users', s.admin, { cedula: '9300400501', firstName: 'Auditada', lastName: 'Persona Real', role: 'player', age: 41 })
    const row = find(await logs(), 'user.created', created.body.data.id)
    expect(row).toMatchObject({ actorId: s.admin.id, actorRole: 'admin', targetType: 'user', targetId: created.body.data.id })
    expect(row.changes).toEqual({ fields: ['age', 'cedula', 'firstName', 'lastName', 'role'], role: 'player' })
    expect(row.ipHash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(row)).not.toMatch(/9300400501|Auditada|Persona Real/)
    expect(new Date(row.occurredAt).toISOString()).toBe(row.occurredAt)
  })

  it('la API legacy también se audita (el panel actual todavía la usa)', async () => {
    const created = await send('post', '/api/organizations', s.admin, { name: 'Mina Auditada Legacy', type: 'Mina' })
    const row = find(await logs(), 'organization.created', created.body.data.id)
    expect(row).toMatchObject({ actorId: s.admin.id, targetType: 'organization', changes: { name: 'Mina Auditada Legacy', type: 'Mina' } })
  })

  it('habilitar y deshabilitar quedan como acciones distintas', async () => {
    const url = `/api/v1/organizations/${s.org.id}/active`
    await send('put', url, s.admin, { isActive: false })
    await send('put', url, s.admin, { isActive: true })
    const rows = await logs(`&targetId=${s.org.id}`)
    const actions = rows.map((r) => r.action)
    expect(actions).toEqual(expect.arrayContaining(['organization.disabled', 'organization.enabled']))
    expect(actions.indexOf('organization.enabled')).toBeLessThan(actions.indexOf('organization.disabled'))
  })

  it('una acción fallida no deja registro de éxito', async () => {
    const before = (await logs('&action=user.created')).length
    expect((await send('post', '/api/v1/users', s.admin, { cedula: '9300400501' })).status).toBe(409)
    expect((await logs('&action=user.created')).length).toBe(before)
  })

  it('los inicios de sesión del personal quedan; los de jugadores no; los fallidos guardan la huella de la cédula', async () => {
    await send('post', '/api/v1/auth/login', null, { cedula: s.developer.cedula, password: s.staffPassword })
    await send('post', '/api/v1/auth/login', null, { cedula: p1.cedula })
    await send('post', '/api/v1/auth/login', null, { cedula: '5550001112', password: 'incorrecta' })
    const rows = await logs()
    const ok = find(rows, 'auth.login_succeeded', s.developer.id)
    expect(ok).toMatchObject({ actorId: s.developer.id, actorRole: 'developer' })
    expect(rows.some((r) => r.action === 'auth.login_succeeded' && r.targetId === p1.id)).toBe(false)
    const failed = rows.find((r) => r.action === 'auth.login_failed')
    expect(failed.actorId).toBeNull()
    expect(failed.changes.cedula).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(failed)).not.toContain('5550001112')
  })

  it('salas y versiones del juego: iniciar, terminar y exportar quedan registradas', async () => {
    const room = (await send('post', '/api/v1/sessions', s.instructor, { name: 'Sala auditada', locationId: s.location.id })).body.data
    await send('put', `/api/v1/sessions/${room.id}/status`, s.instructor, { status: 'active' })
    await send('put', `/api/v1/sessions/${room.id}/status`, s.instructor, { status: 'finished' })
    const rows = await logs(`&targetId=${room.id}`)
    expect(rows.map((r) => r.action).sort()).toEqual(['session.ended', 'session.started'])
    expect(rows.every((r) => r.actorId === s.instructor.id && r.actorRole === 'instructor')).toBe(true)
  })

  it('filtra por actor, acción y fechas, y pagina', async () => {
    const byActor = await logs(`&actorId=${s.instructor.id}`)
    expect(byActor.length).toBeGreaterThan(0)
    expect(byActor.every((r) => r.actorId === s.instructor.id)).toBe(true)
    const byAction = await send('get', '/api/v1/audit-logs?action=user.created&limit=1', s.admin)
    expect(byAction.body.data).toHaveLength(1)
    expect(byAction.body.meta.total).toBeGreaterThanOrEqual(1)
    const future = new Date(Date.now() + 86_400_000).toISOString()
    expect((await send('get', `/api/v1/audit-logs?from=${future}`, s.admin)).body.meta.total).toBe(0)
    expect((await send('get', '/api/v1/audit-logs?action=inventada', s.admin)).body.error.code).toBe('VALIDATION_ERROR')
  })

  it('solo admin y desarrollador consultan el registro', async () => {
    expect((await send('get', '/api/v1/audit-logs', s.developer)).status).toBe(200)
    expect((await send('get', '/api/v1/audit-logs', s.instructor)).status).toBe(403)
    expect((await send('get', '/api/v1/audit-logs', p1)).status).toBe(403)
    expect((await send('get', '/api/v1/audit-logs', null)).status).toBe(401)
  })

  it('exporta CSV con encabezados y escapa lo que lleva comas', async () => {
    const res = await send('get', '/api/v1/audit-logs/export?action=user.created', s.admin).buffer(true).parse((r, cb) => { let t = ''; r.on('data', (c) => { t += c }); r.on('end', () => cb(null, t)) })
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/csv/)
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="auditoria-\d{4}-\d{2}-\d{2}\.csv"$/)
    const [header, first] = res.body.split('\n')
    expect(header).toBe('occurredAt,actorId,actorRole,action,targetType,targetId,changes,ipHash,userAgent')
    expect(first).toContain('user.created')
    expect(first).toContain('""fields"":')
  })

  it('la tabla es de solo inserción: la base rechaza UPDATE, DELETE y TRUNCATE', async () => {
    await expect(sequelize.query("UPDATE audit_logs SET action = 'x'")).rejects.toThrow(/solo inserción/)
    await expect(sequelize.query('DELETE FROM audit_logs')).rejects.toThrow(/solo inserción/)
    await expect(sequelize.query('TRUNCATE audit_logs')).rejects.toThrow(/solo inserción/)
    expect((await logs()).length).toBeGreaterThan(0)
  })

  it('una petición sin cabecera de navegador igual se audita', async () => {
    const res = await request(app).post('/api/v1/locations').set('Authorization', `Bearer ${require('../support/auth.cjs').tokenFor(s.admin)}`).set('User-Agent', '').send({ municipality: 'Auditoria', department: 'Sin Navegador' })
    expect(res.status).toBe(201)
    expect(find(await logs(), 'location.created', res.body.data.id)).toBeDefined()
  })
})
