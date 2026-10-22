import { createRequire } from 'node:module'
import { describe, it, expect, inject } from 'vitest'

const require = createRequire(import.meta.url)
const { send } = require('../support/contract.cjs')

// Lecturas acotadas contra Postgres real: el instructor solo lee a los jugadores de sus salas; el desarrollador ve los
// datos sin información personal y no exporta el Excel. Aplica a la API legacy y a la v1.
const s = inject('seed')
const [inScope] = s.players

// Un jugador que no está en ninguna sala del instructor ni juega en el Juego libre de su localidad
const createOutsider = async () => {
  const created = await send('post', '/api/v1/users', s.admin, { cedula: '9500600701', firstName: 'Ajeno', lastName: 'Sin Sala', role: 'player', age: 28 })
  return { id: created.body.data.id, cedula: '9500600701', role: 'player' }
}

describe('el instructor solo lee a los jugadores de sus salas', () => {
  it('el detalle de un jugador de su sala pasa y el de otro es 403 USER_OUT_OF_SCOPE (v1 y legacy)', async () => {
    const outsider = await createOutsider()
    expect((await send('get', `/api/v1/users/${inScope.id}`, s.instructor)).status).toBe(200)
    const denied = await send('get', `/api/v1/users/${outsider.id}`, s.instructor)
    expect([denied.status, denied.body.error.code]).toEqual([403, 'USER_OUT_OF_SCOPE'])
    expect((await send('get', `/api/users/${outsider.id}`, s.instructor)).status).toBe(403)
    expect((await send('get', `/api/v1/users/${outsider.id}`, s.admin)).status).toBe(200)
  })

  it('las listas solo traen a sus jugadores', async () => {
    const outsider = await createOutsider().catch(() => null)
    const ids = (await send('get', '/api/v1/users?limit=100', s.instructor)).body.data.map((u) => u.id)
    expect(ids).toContain(inScope.id)
    expect(ids).not.toContain(s.admin.id)
    expect(ids).not.toContain(outsider?.id)
    const all = (await send('get', '/api/v1/users?limit=100', s.admin)).body.data.map((u) => u.id)
    expect(all).toEqual(expect.arrayContaining([s.admin.id, inScope.id]))
  })

  it('el historial, los resultados VARK y la telemetría de un jugador ajeno también se niegan', async () => {
    const outsider = await createOutsider().catch(async () => ({ id: (await send('get', '/api/v1/users?limit=100&role=player', s.admin)).body.data.find((u) => u.cedula === '9500600701').id }))
    for (const path of [`/api/v1/users/${outsider.id}/sessions`, `/api/v1/users/${outsider.id}/attempts`, `/api/v1/users/${outsider.id}/risk-results`, `/api/v1/users/${outsider.id}/telemetry-summary`]) {
      expect((await send('get', path, s.instructor)).status, path).toBe(403)
    }
    expect((await send('get', `/api/v1/users/${inScope.id}/attempts`, s.instructor)).status).toBe(200)
    const vark = (await send('get', '/api/v1/vark-results?limit=100', s.instructor)).body.data.map((r) => r.userId)
    expect(vark).not.toContain(outsider.id)
    expect(vark).toContain(inScope.id)
  })

  it('el detalle de un intento de un jugador ajeno se niega y el de uno propio de su sala pasa', async () => {
    const attempt = await send('get', `/api/v1/attempts/${s.attempts[0]}`, s.instructor)
    expect(attempt.status).toBe(200)
    const outsider = await createOutsider().catch(() => null)
    const started = await send('post', '/api/v1/attempts', { id: (outsider ?? s.players[2]).id, cedula: '9500600701', role: 'player' }, { levelKey: 'level1' })
    if (started.status === 201 && outsider) {
      expect((await send('get', `/api/v1/attempts/${started.body.data.id}`, s.instructor)).status).toBe(403)
    }
  })
})

describe('el desarrollador ve los datos sin información personal', () => {
  it('cédula, nombres, correo y edad salen enmascarados en v1 y en legacy; el admin los ve completos', async () => {
    const v1 = (await send('get', '/api/v1/users?role=player&limit=100', s.developer)).body.data.find((u) => u.id === inScope.id)
    expect(v1.cedula).toBe(`***${inScope.cedula.slice(-3)}`)
    expect(v1.firstName).toMatch(/^[A-Z]\.$/)
    expect(v1.lastName).toMatch(/^[A-Z]\.$/)
    expect(v1.age).toBeNull()
    expect(v1.role).toBe('player')
    const legacy = (await send('get', `/api/users/${inScope.id}`, s.developer)).body
    expect(legacy.cedula).toBe(`***${inScope.cedula.slice(-3)}`)
    expect(legacy.first_name).toMatch(/^[A-Z]\.$/)
    const full = (await send('get', `/api/v1/users/${inScope.id}`, s.admin)).body.data
    expect(full.cedula).toBe(inScope.cedula)
    expect(full.firstName).not.toMatch(/^[A-Z]\.$/)
  })

  it('el detalle de una sala y el análisis de un participante también salen enmascarados', async () => {
    const detail = (await send('get', `/api/v1/sessions/${s.session.id}`, s.developer)).body.data
    expect(detail.participants[0].user.firstName).toMatch(/^[A-Z]\.$/)
    expect(detail.participants[0].user.cedula).toMatch(/^\*\*\*\d{3}$/)
    expect(detail.participants[0]).toHaveProperty('percentage')
    const analysis = await send('get', `/api/v1/sessions/${s.session.id}/participants/${inScope.id}/analysis`, s.developer)
    expect(analysis.status).toBe(200)
    expect(JSON.stringify(analysis.body)).not.toContain(inScope.cedula)
  })

  it('no exporta el informe en Excel (lleva nombres y cédulas), en v1 y en legacy; el instructor y el admin sí', async () => {
    const denied = await send('get', `/api/v1/sessions/${s.session.id}/report.xlsx`, s.developer)
    expect([denied.status, denied.body.error.code]).toEqual([403, 'DATA_NOT_AVAILABLE_TO_ROLE'])
    expect((await send('get', `/api/sessions/${s.session.id}/export.xlsx`, s.developer)).status).toBe(403)
    expect((await send('get', `/api/v1/sessions/${s.session.id}/report.xlsx`, s.admin)).status).toBe(200)
  })

  it('lo demás sigue funcionando para soporte: salud, despliegue y registro de auditoría', async () => {
    expect((await send('get', '/api/v1/health/details', s.developer)).status).toBe(200)
    expect((await send('get', '/api/v1/game-versions/status', s.developer)).status).toBe(200)
    expect((await send('get', '/api/v1/audit-logs', s.developer)).status).toBe(200)
  })
})
