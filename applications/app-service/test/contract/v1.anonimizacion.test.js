import { createRequire } from 'node:module'
import { describe, it, expect, inject } from 'vitest'

const require = createRequire(import.meta.url)
const { send } = require('../support/contract.cjs')
const { sequelize } = require('../../dist/container')

// Derecho de supresión (Ley 1581 de 2012) contra Postgres real: la persona deja de ser identificable, su progreso queda
// y la cuenta no vuelve a entrar.
const s = inject('seed')

const createPlayer = async (cedula) => {
  const created = await send('post', '/api/v1/users', s.admin, { cedula, firstName: 'Titular', lastName: 'De Los Datos', role: 'player', age: 36, email: 'titular@mina.co' })
  return { id: created.body.data.id, cedula, role: 'player' }
}

describe('anonimizar una cuenta', () => {
  it('solo un admin; el jugador, el instructor y el desarrollador reciben 403', async () => {
    const target = await createPlayer('9600700801')
    for (const who of [target, s.instructor, s.developer]) {
      expect((await send('post', `/api/v1/users/${target.id}/anonymization`, who)).status).toBe(403)
    }
    expect((await send('post', `/api/v1/users/${target.id}/anonymization`, null)).status).toBe(401)
  })

  it('quita nombre, cédula, usuario, correo y edad; deja la cuenta deshabilitada y conserva el progreso', async () => {
    const target = await createPlayer('9600700802')
    const attempt = await send('post', '/api/v1/attempts', target, { levelKey: 'level1' })
    await send('post', '/api/v1/risk-results', target, { riskId: 'CR-01', isMitigated: true, reactionTimeMs: 800 })
    const res = await send('post', `/api/v1/users/${target.id}/anonymization`, s.admin)
    expect(res.status).toBe(204)

    const row = (await send('get', `/api/v1/users/${target.id}`, s.admin)).body.data
    expect(row).toMatchObject({ id: target.id, firstName: 'Anonimizado', lastName: null, age: null, email: null, isActive: false, role: 'player' })
    expect(row.cedula).toBe(`anon-${target.id.slice(0, 8)}`)
    expect(row.username).toBe(row.cedula)
    const [stored] = await sequelize.query('SELECT first_name, last_name, cedula, username, email, age, is_active FROM users WHERE id = :id', { replacements: { id: target.id }, type: 'SELECT' })
    expect(JSON.stringify(stored)).not.toMatch(/9600700802|Titular|De Los Datos|titular@mina/)

    const [{ count }] = await sequelize.query('SELECT count(*)::int AS count FROM level_attempts WHERE user_id = :id', { replacements: { id: target.id }, type: 'SELECT' })
    expect(count).toBe(1)
    const [{ risks }] = await sequelize.query('SELECT count(*)::int AS risks FROM user_risk_progress WHERE user_id = :id', { replacements: { id: target.id }, type: 'SELECT' })
    expect(risks).toBe(1)
    expect(attempt.status).toBe(201)
  })

  it('la cuenta anonimizada no vuelve a entrar: ni con la cédula original, ni con el alias, ni con su token', async () => {
    const target = await createPlayer('9600700803')
    const token = (await send('post', '/api/v1/auth/login', null, { cedula: target.cedula })).body.data.token
    await send('post', `/api/v1/users/${target.id}/anonymization`, s.admin)
    expect((await send('post', '/api/v1/auth/login', null, { cedula: target.cedula })).status).toBe(401)
    expect((await send('post', '/api/v1/auth/login', null, { cedula: `anon-${target.id.slice(0, 8)}` })).status).toBe(401)
    const withOldToken = await send('get', '/api/v1/levels', null).set('Authorization', `Bearer ${token}`)
    expect([withOldToken.status, withOldToken.body.error.code]).toEqual([403, 'ACCOUNT_DISABLED'])
  })

  it('el mismo número de cédula puede volver a registrarse como una persona nueva', async () => {
    const again = await send('post', '/api/v1/users', s.admin, { cedula: '9600700803', firstName: 'Otra', lastName: 'Persona', role: 'player' })
    expect(again.status).toBe(201)
  })

  it('reglas: no la propia cuenta, no una inexistente, no dos veces', async () => {
    const target = await createPlayer('9600700804')
    expect((await send('post', `/api/v1/users/${s.admin.id}/anonymization`, s.admin)).body.error.code).toBe('CANNOT_ANONYMIZE_SELF')
    expect((await send('post', '/api/v1/users/00000000-0000-4000-8000-000000000000/anonymization', s.admin)).status).toBe(404)
    expect((await send('post', `/api/v1/users/${target.id}/anonymization`, s.admin)).status).toBe(204)
    const second = await send('post', `/api/v1/users/${target.id}/anonymization`, s.admin)
    expect([second.status, second.body.error.code]).toEqual([409, 'USER_ALREADY_ANONYMIZED'])
  })

  it('queda en el registro de auditoría, sin datos personales', async () => {
    const target = await createPlayer('9600700805')
    await send('post', `/api/v1/users/${target.id}/anonymization`, s.admin)
    const rows = (await send('get', `/api/v1/audit-logs?action=user.anonymized&targetId=${target.id}`, s.admin)).body.data
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ actorId: s.admin.id, actorRole: 'admin', targetType: 'user', targetId: target.id })
    expect(JSON.stringify(rows)).not.toMatch(/9600700805|Titular/)
  })
})
