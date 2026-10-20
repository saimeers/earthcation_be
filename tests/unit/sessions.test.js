import { describe, it, expect } from 'vitest'
import { canControl, canSee, roomCode, toJoinCode, toNewSession, toRoomCode } from '../../src/contexts/sessions/domain'
import { avg, performanceBand, sessionDetail } from '../../src/contexts/sessions/detail'
import { participantAnalysis, participantIndex } from '../../src/contexts/sessions/analysis'
import { failReasonLabel, levelLabel, stageLabel } from '../../src/contexts/sessions/labels'
import { bogota, resultRows, secs } from '../../src/contexts/sessions/report'
import { makeSessions } from '../../src/contexts/sessions/application'

const room = { id: 's1', instructorId: 'i1', locationId: 'L', isFreePlay: false, status: 'waiting' }
const free = { ...room, id: 'free', instructorId: null, isFreePlay: true, status: 'active' }

describe('reglas de sala', () => {
  it('código de 3 dígitos con ceros a la izquierda', () => {
    expect([roomCode(() => 0.042), roomCode(() => 0.9999)]).toEqual(['042', '999'])
    expect(toRoomCode('12a').error.message).toBe('El código de sala tiene 3 dígitos')
  })
  it('validaciones de creación y unión', () => {
    expect(toNewSession({ location_id: 'L' }).error.message).toBe('El nombre de la sesión es requerido')
    expect(toNewSession({ name: 'Sala' }).error.message).toBe('La localidad (location_id) es requerida')
    expect(toJoinCode({}).error.message).toBe('El código es requerido')
  })
  it('solo el dueño controla su sala; el Juego libre nunca', () => {
    expect(canControl(room, 'i1').ok).toBe(true)
    expect(canControl(room, 'otro').error.kind).toBe('forbidden')
    expect(canControl(null, 'i1').error.kind).toBe('forbidden')
    expect(canControl(free, 'i1').error.message).toBe('La sesión de juego libre siempre está activa')
  })
  it('el Juego libre lo ve el instructor de la misma localidad', () => {
    expect([canSee(free, 'i9', 'L'), canSee(free, 'i9', 'otra'), canSee(room, 'i9', 'L')]).toEqual([true, false, false])
  })
})

describe('detalle de sesión', () => {
  const user = (id, name) => ({ id, first_name: name, last_name: 'X', varkProfile: { dominant_style: 'Visual' }, profile: { organization: { name: 'Mina' } } })
  const result = (u, attempt, ok, at, risk = 'CR-01') =>
    ({ user_id: u, attempt_id: attempt, risk_id: risk, is_mitigated: ok, mistakes_count: ok ? 0 : 2, reaction_time_ms: 1000, recorded_at: at, risk: { level_id: 1, name: risk, level: { id: 1, name: 'Nivel 1' } } })
  const input = {
    session: { id: 's1', name: 'Sala', participants: [{ user_id: 'a', user: user('a', 'Ana') }, { user_id: 'b', user: user('b', 'Beto') }, { user_id: 'c', user: user('c', 'Caro') }] },
    results: [
      result('a', 'a1', false, '2026-01-01T10:00:00Z'), result('a', 'a2', true, '2026-01-01T11:00:00Z'), result('a', 'a2', true, '2026-01-01T11:01:00Z', 'CR-02'),
      result('b', 'b1', false, '2026-01-01T10:00:00Z'), result('b', 'b1', true, '2026-01-01T10:01:00Z', 'CR-02'),
    ],
    attempts: [
      { id: 'a1', user_id: 'a', level_key: 'level1', outcome: 'failed', fail_reason: 'derrumbe', attempt_number: 1, duration_ms: 1000 },
      { id: 'a2', user_id: 'a', level_key: 'level1', outcome: 'completed', attempt_number: 2, duration_ms: 3000 },
      { id: 'b1', user_id: 'b', level_key: 'level1', outcome: 'failed', fail_reason: null, attempt_number: 1 },
    ],
  }
  const d = sessionDetail(input)

  it('bandas y resumen con el último intento', () => {
    expect(d.participants.map((p) => [p.percentage, p.band])).toEqual([[100, 'destacado'], [50, 'en_progreso'], [0, 'sin_datos']])
    expect(d.summary).toMatchObject({ participants: 3, with_data: 2, avg_percentage: 75, level_attempts: 3, level_completed: 1, completion_rate: 33, bands: { destacado: 1, en_progreso: 1, refuerzo: 0, sin_datos: 1 } })
    expect(d.fail_reasons).toEqual([{ level_key: 'level1', fail_reason: 'derrumbe', fail_stage: null, count: 1 }, { level_key: 'level1', fail_reason: 'desconocido', fail_stage: null, count: 1 }])
  })

  it('telemetría y recorrido por participante', () => {
    const [ana] = d.participants
    expect(ana).toMatchObject({ organization: 'Mina', dominant_style: 'Visual', level_attempts: 2, mistakes_total: 0 })
    expect(ana.telemetry).toMatchObject({ attempts: 2, completed: 1, failed: 1, best_time_ms: 3000, total_time_ms: 4000, top_fail_reason: { reason: 'derrumbe', count: 1 } })
    expect(ana.telemetry.journeys.level1.map((j) => j.outcome)).toEqual(['failed', 'completed'])
    expect(ana.by_level).toHaveLength(1)
    expect(ana.by_level[0]).toMatchObject({ name: 'Nivel 1', total: 2, mitigated: 2, attempts: 2 })
  })

  it('análisis: posición, navegación y quien no participa', () => {
    expect(participantIndex(d, 'zz').error.message).toBe('El usuario no participa en esta sesión')
    const a = participantAnalysis({ detail: d, userId: 'b', user: null, attempts: [{ summary: { saltos: 2 } }, { summary: { saltos: 1, nota: 'x' } }], eventCounts: [], readTimes: [{ user_id: 'b', panels: '3', avg_read_ms: '1500.4' }] }, 1)
    expect(a.group.rank).toBe(2)
    expect(a.navigation).toEqual({ index: 1, total: 3, prev: 'a', next: 'c' })
    expect(a.summary_counters).toEqual({ saltos: 3 })
    expect(a.reading).toEqual({ panels: 3, avg_read_ms: 1500, group_avg_read_ms: 1500 })
  })

  it('utilidades', () => {
    expect([performanceBand(80, true), performanceBand(39, true), performanceBand(100, false)]).toEqual(['destacado', 'refuerzo', 'sin_datos'])
    expect([avg([1, null, 3]), avg([])]).toEqual([2, null])
  })
})

describe('Excel', () => {
  it('etiquetas en español', () => {
    expect([stageLabel('Methane2'), stageLabel('Otra'), stageLabel(null)]).toEqual(['Metano 2', 'Otra', ''])
    expect([levelLabel('level3'), levelLabel('reto_memoria'), levelLabel(undefined)]).toEqual(['Nivel 3', 'Reto de memoria', ''])
    expect([failReasonLabel('mordedura_ofidio'), failReasonLabel('nuevo'), failReasonLabel(null)]).toEqual(['Mordedura de serpiente', 'nuevo', ''])
  })
  it('hora de Colombia, segundos y orden de resultados', () => {
    expect(bogota('2026-01-01T05:00:00Z').toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect([secs(1550), secs(null)]).toEqual([1.6, null])
    const participants = [
      { user: { first_name: 'Zoe' }, by_level: [{ name: 'N1', risks: [{ risk_id: 'R', is_mitigated: true, recorded_at: '2026-01-01T00:00:00Z' }] }] },
      { user: { first_name: 'Ana' }, by_level: [{ name: 'N1', risks: [{ risk_id: 'R', is_mitigated: false, recorded_at: '2026-01-02T00:00:00Z' }] }] },
    ]
    expect(resultRows(participants).map((r) => [r.nombre, r.result])).toEqual([['Ana', 'Fallido'], ['Zoe', 'Mitigado']])
  })
})

describe('casos de uso de sesiones', () => {
  const setup = () => {
    const sessions = new Map([['s1', room], ['free', free], ['done', { ...room, id: 'done', status: 'finished' }]])
    const enrolled = new Set()
    const bumps = []
    const used = new Set(['000'])
    const repo = {
      codeInUse: async (c) => used.has(c), create: async (s) => s, find: async (id) => sessions.get(id) ?? null,
      findByCode: async (code) => { const s = [...sessions.values()].find((x) => x.id === code); return s ? { session: s, view: { id: s.id } } : null },
      isEnrolled: async (id, u) => enrolled.has(`${id}|${u}`), enroll: async (id, u) => { enrolled.add(`${id}|${u}`) },
      update: async (id, values) => ({ id, ...values }), profileLocation: async () => 'L', freeSessionFor: async () => 'free',
    }
    const cache = { remember: async (_e, compute) => compute(), setIfAbsent: async () => true, bump: async (ns) => { bumps.push(ns) } }
    const randoms = [0, 0.5]
    return { s: makeSessions({ sessions: repo, cache, random: () => randoms.shift() ?? 0.7, now: () => new Date(0) }), bumps }
  }

  it('código libre: reintenta si el sorteado está en uso', async () => {
    const { s } = setup()
    expect((await s.create('i1', { name: 'Sala', location_id: 'L' })).value.code).toBe('500')
  })
  it('unirse: dos veces no duplica; una sala finalizada no acepta', async () => {
    const { s } = setup()
    expect((await s.join('p', { code: 's1' })).value.joined).toBe(true)
    expect((await s.join('p', { code: 's1' })).value.joined).toBe(false)
    expect((await s.join('p', { code: 'done' })).error.message).toBe('Esta sesión ya ha finalizado')
    expect((await s.join('p', { code: 'nada' })).error.message).toBe('Código de sesión inválido')
  })
  it('iniciar invalida la caché del detalle', async () => {
    const { s, bumps } = setup()
    expect((await s.start('s1', 'i1')).value).toMatchObject({ status: 'active' })
    expect(bumps).toEqual(['session:s1'])
  })
  it('sala libre: la enviada o la del jugador', async () => {
    const { s } = setup()
    expect([await s.freeSessions.resolve('p', 'sala'), await s.freeSessions.resolve('p', null)]).toEqual(['sala', 'free'])
  })
})
