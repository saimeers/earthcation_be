import { createRequire } from 'node:module'
import { describe, it, expect, inject, beforeAll } from 'vitest'

const require = createRequire(import.meta.url)
const { send, contract, app } = require('../support/contract.cjs')
const request = require('supertest')

// Contrato de las escrituras de v1: permisos por rol (estado) y forma de la respuesta. Cada caso crea
// sus propias entidades para no alterar la semilla que leen los snapshots de lectura.
const s = inject('seed')
const [p1, p2, p3] = s.players
const STAFF = { instructor: s.instructor, desarrollador: s.developer }
const snap = async (res) => expect(contract(await res)).toMatchSnapshot()

describe('auth', () => {
  it('login de jugador solo con cédula', () => snap(send('post', '/api/auth/login', null, { cedula: p1.cedula })))
  it('login de admin con contraseña', () =>
    snap(send('post', '/api/auth/login', null, { cedula: s.admin.cedula, password: s.staffPassword })))
  it('login de admin con contraseña errada', () =>
    snap(send('post', '/api/auth/login', null, { cedula: s.admin.cedula, password: 'otra-clave' })))
  it('login de admin sin contraseña', () => snap(send('post', '/api/auth/login', null, { cedula: s.admin.cedula })))
  it('login sin cédula', () => snap(send('post', '/api/auth/login', null, {})))
  it('login con cédula inexistente', () => snap(send('post', '/api/auth/login', null, { cedula: '99999999' })))
  it('forgot-password responde igual exista o no', async () => {
    const a = contract(await send('post', '/api/auth/forgot-password', null, { email: 'admin@earthcation.test' }))
    const b = contract(await send('post', '/api/auth/forgot-password', null, { email: 'nadie@earthcation.test' }))
    expect(a).toEqual(b)
    expect(a).toMatchSnapshot()
  })
  it('reset-password con token inválido', () =>
    snap(send('post', '/api/auth/reset-password', null, { token: 'no-es-un-token', new_password: 'Nueva-clave-123' })))
  it('register ya no existe', () => snap(send('post', '/api/auth/register', null, { cedula: '1' })))
})

describe('usuarios', () => {
  const body = (cedula) => ({ cedula, first_name: 'Nuevo', last_name: 'Usuario', role: 'player' })

  it.each([['anonimo', null], ['jugador', p1], ...Object.entries(STAFF)])('crear como %s', (_, who) =>
    snap(send('post', '/api/users', who, body('40000001'))))

  it('crear jugador como admin, luego deshabilitar y habilitar', async () => {
    const created = await send('post', '/api/users', s.admin, body('40000002'))
    expect(contract(created)).toMatchSnapshot()
    const id = created.body.user_id
    expect(contract(await send('patch', `/api/users/${id}/disable`, s.admin))).toMatchSnapshot()
    expect(contract(await send('patch', `/api/users/${id}/enable`, s.admin))).toMatchSnapshot()
    expect(contract(await send('patch', `/api/users/${id}/disable`, s.instructor))).toMatchSnapshot()
  })

  it('instructor sin correo no se crea', () =>
    snap(send('post', '/api/users', s.admin, { ...body('40000003'), role: 'instructor' })))
  it('cédula repetida', () => snap(send('post', '/api/users', s.admin, body(p1.cedula))))

  // Regresión de la fase 0: un jugador no puede subirse de rol editando su propio usuario
  it('un jugador que se edita a sí mismo no cambia de rol ni de cédula', async () => {
    const res = await send('put', `/api/users/${p3.id}`, p3, { first_name: 'Editado', role: 'admin', cedula: '1' })
    expect(contract(res)).toMatchSnapshot()
    const after = await send('get', `/api/users/${p3.id}`, s.admin)
    expect(after.body).toMatchObject({ role: 'player', cedula: p3.cedula, first_name: 'Editado' })
  })
  it('admin edita otro usuario', () => snap(send('put', `/api/users/${p2.id}`, s.admin, { last_name: 'Cambiado' })))
})

describe('organizaciones y localidades', () => {
  it.each([['jugador', p1], ['instructor', s.instructor], ['admin', s.admin]])('crear organización como %s', (role, who) =>
    snap(send('post', '/api/organizations', who, { name: `Mina de ${role}`, type: 'Mina' })))

  it('editar, deshabilitar y habilitar organización', async () => {
    const { body } = await send('post', '/api/organizations', s.admin, { name: 'Mina temporal', type: 'Mina' })
    const id = body.data.id
    expect(contract(await send('put', `/api/organizations/${id}`, s.admin, { name: 'Mina renombrada' }))).toMatchSnapshot()
    expect(contract(await send('patch', `/api/organizations/${id}/disable`, s.instructor))).toMatchSnapshot()
    expect(contract(await send('patch', `/api/organizations/${id}/disable`, s.admin))).toMatchSnapshot()
    expect(contract(await send('patch', `/api/organizations/${id}/enable`, s.admin))).toMatchSnapshot()
  })
  it('organización con nombre repetido', () =>
    snap(send('post', '/api/organizations', s.admin, { name: s.org.name, type: 'Mina' })))

  it('crear, editar, deshabilitar y habilitar localidad', async () => {
    const created = await send('post', '/api/locations', s.admin, { municipality: 'Pueblo de Prueba', department: 'Depto de Prueba' })
    expect(contract(created)).toMatchSnapshot()
    const id = (created.body.data || created.body).id
    expect(contract(await send('put', `/api/locations/${id}`, s.admin, { municipality: 'Pueblo Editado' }))).toMatchSnapshot()
    expect(contract(await send('patch', `/api/locations/${id}/disable`, s.admin))).toMatchSnapshot()
    expect(contract(await send('patch', `/api/locations/${id}/enable`, s.admin))).toMatchSnapshot()
    expect(contract(await send('post', '/api/locations', p1, { municipality: 'X', department: 'Y' }))).toMatchSnapshot()
  })
})

describe('sesiones', () => {
  let session
  beforeAll(async () => {
    session = (await send('post', '/api/sessions', s.instructor, { name: 'Sala de escritura', location_id: s.location.id })).body
  })

  it('crear como jugador y como desarrollador', async () => {
    expect(contract(await send('post', '/api/sessions', p1, { name: 'X', location_id: s.location.id }))).toMatchSnapshot()
    expect(contract(await send('post', '/api/sessions', s.developer, { name: 'X', location_id: s.location.id }))).toMatchSnapshot()
  })
  it('crear como instructor', () => expect(session).toBeDefined())
  it('respuesta de creación', async () => {
    const res = await send('post', '/api/sessions', s.instructor, { name: 'Otra sala', location_id: s.location.id })
    expect(contract(res)).toMatchSnapshot()
  })
  it('unirse a sala en espera, iniciar, terminar', async () => {
    const live = session.session || session
    expect(contract(await send('post', '/api/sessions/join', p3, { code: live.code }))).toMatchSnapshot()
    expect(contract(await send('patch', `/api/sessions/${live.id}/start`, p1))).toMatchSnapshot()
    expect(contract(await send('patch', `/api/sessions/${live.id}/start`, s.instructor))).toMatchSnapshot()
    expect(contract(await send('patch', `/api/sessions/${live.id}/end`, s.instructor))).toMatchSnapshot()
    expect(contract(await send('post', '/api/sessions/join', p3, { code: live.code }))).toMatchSnapshot()
  })
  it('unirse con código inexistente', () => snap(send('post', '/api/sessions/join', p1, { code: '000' })))
  it('unirse sin código', () => snap(send('post', '/api/sessions/join', p1, {})))
})

describe('juego: intentos, eventos, progreso, VARK', () => {
  it('flujo completo de un intento', async () => {
    const start = await send('post', '/api/telemetry/attempts', p2, { level_key: 'level1', session_id: s.session.id })
    expect(contract(start)).toMatchSnapshot()
    const id = start.body.attempt.id
    const events = [{ event_type: 'level_started', t_ms: 0 }]
    expect(contract(await send('post', '/api/telemetry/events', p2, { attempt_id: id, events }))).toMatchSnapshot()
    const progress = { risk_id: 'CR-01', session_id: s.session.id, attempt_id: id, is_mitigated: true, mistakes_count: 0 }
    expect(contract(await send('post', '/api/progress/save', p2, progress))).toMatchSnapshot()
    expect(contract(await send('patch', `/api/telemetry/attempts/${id}`, p2, { outcome: 'completed' }))).toMatchSnapshot()
    // Un jugador no puede tocar el intento de otro
    expect(contract(await send('patch', `/api/telemetry/attempts/${id}`, p1, { outcome: 'failed' }))).toMatchSnapshot()
    expect(contract(await send('post', '/api/telemetry/events', p1, { attempt_id: id, events }))).toMatchSnapshot()
  })
  it('intento sin level_key', () => snap(send('post', '/api/telemetry/attempts', p1, {})))
  it('eventos vacíos', () => snap(send('post', '/api/telemetry/events', p1, { attempt_id: s.attempts[0], events: [] })))
  it('progreso con riesgo inexistente', () =>
    snap(send('post', '/api/progress/save', p1, { risk_id: 'CR-99', is_mitigated: true })))
  it('VARK', () => snap(send('post', '/api/vark/submit', p1, { answers: { q1: 'A', q2: 'A', q3: 'A', q4: 'A' } })))
})

describe('importación masiva, despliegue y visitas', () => {
  it('parse sin archivo', () => snap(send('post', '/api/users/bulk-import/parse', s.admin)))
  it('parse como jugador', () => snap(send('post', '/api/users/bulk-import/parse', p1)))
  it('confirm sin filas', () => snap(send('post', '/api/users/bulk-import/confirm', s.admin, { rows: [] })))
  it('crear versión como jugador', () => snap(send('post', '/api/deploy/versions', p1, { label: 'x', size_bytes: 1 })))
  it('crear versión sin datos', () => snap(send('post', '/api/deploy/versions', s.developer, {})))
  it('activar versión inexistente', () =>
    snap(send('post', '/api/deploy/versions/00000000-0000-0000-0000-000000000000/activate', s.admin)))
  it('ingesta de visitas sin secreto', () => snap(send('post', '/api/visits/ingest', null, { path: '/' })))

  // Visitas de persona y de robot como las manda el Worker; las estadísticas se piden a 90 días para no
  // reusar la caché de 7 días que llenó el snapshot de lectura
  const ingest = (visit) =>
    request(app).post('/api/visits/ingest').set('x-ingest-secret', process.env.VISITS_INGEST_SECRET).send(visit)
  const CHROME = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36'
  it('ingesta de visitas con secreto y estadísticas', async () => {
    const human = {
      visitor: 'a'.repeat(64), version_id: s.session.id, country: 'CO', region: 'Norte de Santander Department',
      city: 'Cúcuta', colo: 'BOG', latitude: '7.89', longitude: -72.5, session_code: '123', asn: 27951,
      as_organization: 'Media Commerce', user_agent: CHROME,
    }
    expect((await ingest(human)).status).toBe(204)
    expect((await ingest(human)).status).toBe(204)
    expect((await ingest({ visitor: 'b'.repeat(64), user_agent: 'curl/8.0' })).status).toBe(204)
    expect((await ingest({ visitor: 'c'.repeat(64), user_agent: CHROME, as_organization: 'Hetzner Online' })).status).toBe(204)
    const stats = await send('get', '/api/visits/stats?days=90', s.admin)
    expect(stats.body.totals).toEqual({ visits: 2, unique: 1, via_qr: 2, visitors: 1, bots: 2 })
    expect(stats.body.regions).toEqual([{ country: 'CO', region: 'Norte de Santander', count: 2 }])
    expect(stats.body.versions).toEqual([{ id: s.session.id, label: 'Borrada', count: 2 }])
    expect(stats.body.devices).toEqual([{ key: 'mobile', count: 2 }])
    expect(contract(stats)).toMatchSnapshot()
  })
})
