import type { DomainError } from '../../shared/errors'
import { andThen, err, fromNullable, ok, type Result } from '../../shared/result'
import { sum } from '../../shared/collections'
import { latestAttemptByLevel, summarize } from '@earthcation/model'
import { participantAnalysis, participantIndex } from './analysis'
import { sessionDetail, type Plain, type SessionDetail } from './detail'
import {
  canControl, canSee, invalidCode, noAccess, noLiveSession, roomCode, seesEverything, sessionFinished, sessionNotFound, toJoinCode,
  toNewSession, toRoomCode, type NewSession, type Requester, type Session,
} from './domain'
import type { PlaceFilter, SessionDeps } from './ports'
import { sessionWorkbook } from './workbook'

type Outcome<T> = Promise<Result<T, DomainError>>
type Fields = Readonly<Record<string, unknown>>

export type Joined = { readonly session: Plain; readonly joined: boolean }

const DETAIL_TTL_S = 10
const FREE_SESSION_TTL_S = 600
const detailNamespace = (id: string) => `session:${id}`

// ── Crear, unirse, iniciar y terminar ─────────────────────────────────────────

// Solo choca contra salas vivas: una finalizada libera su código (3 dígitos = 1000 combinaciones)
const freeCode = async (d: SessionDeps): Promise<string> => {
  const code = roomCode(d.random)
  return (await d.sessions.codeInUse(code)) ? freeCode(d) : code
}

const open = (d: SessionDeps, instructorId: string) => async (s: NewSession): Outcome<Plain> =>
  ok(await d.sessions.create({ instructorId, locationId: s.locationId, name: s.name, code: await freeCode(d) }))

const enroll = (d: SessionDeps, userId: string) => async (record: { readonly session: Session; readonly view: Plain }): Outcome<Joined> => {
  if (record.session.status === 'finished') return err(sessionFinished())
  if (await d.sessions.isEnrolled(record.session.id, userId)) return ok({ session: record.view, joined: false })
  await d.sessions.enroll(record.session.id, userId)
  return ok({ session: record.view, joined: true })
}

const join = (d: SessionDeps) => (userId: string, body: Fields): Outcome<Joined> =>
  andThen(andThen(toJoinCode(body), async (code) => fromNullable(await d.sessions.findByCode(code), invalidCode)), enroll(d, userId))

const transition = (d: SessionDeps, values: () => Fields) => async (id: string, instructorId: string): Outcome<Plain> =>
  andThen(canControl(await d.sessions.find(id), instructorId), async (s) => {
    await d.cache.bump(detailNamespace(s.id))
    return ok(await d.sessions.update(s.id, values()))
  })

// ── Permisos de lectura ───────────────────────────────────────────────────────

// Dueño de la sala, o instructor de la misma localidad si es el Juego libre
const visibleTo = async (d: SessionDeps, s: Session | null, instructorId: string): Promise<boolean> =>
  s !== null && canSee(s, instructorId, await d.sessions.profileLocation(instructorId))

// Admin y desarrollador ven todo; el instructor, sus salas y el Juego libre de su localidad (403 si no)
const assertCanView = async (d: SessionDeps, id: string, r: Requester): Outcome<null> =>
  seesEverything(r) || (await visibleTo(d, await d.sessions.find(id), r.id)) ? ok(null) : err(noAccess())

// ── Progreso para el instructor dueño ─────────────────────────────────────────

// % del último intento de cada nivel dentro de la sesión (reintentar reemplaza, no promedia)
const latestScores = (mine: readonly Plain[]) => {
  const latest = latestAttemptByLevel(mine)
  const latestRows = latest.flatMap((l) => l.rows)
  const { total, mitigated, percentage } = summarize(latestRows)
  // v1: el promedio cuenta como 0 las reacciones sin dato, y un promedio 0 sale como null
  const avgTime = total > 0 ? sum(latestRows.map((p) => Number(p.reaction_time_ms ?? 0) || 0)) / total : 0
  return { total_attempts: total, mitigated, percentage, level_attempts: sum(latest.map((l) => l.attempts_count)), avg_reaction_ms: avgTime ? Math.round(avgTime) : null }
}

const styleOf = (su: Plain): unknown => ((((su.user ?? {}) as Plain).varkProfile ?? {}) as Plain).dominant_style || null

const participantProgress = (results: readonly Plain[]) => (su: Plain) => {
  const mine = results.filter((r) => r.user_id === su.user_id)
  const { total_attempts, mitigated, percentage, level_attempts, avg_reaction_ms } = latestScores(mine)
  return { user: su.user, dominant_style: styleOf(su), total_attempts, mitigated, percentage, level_attempts, avg_reaction_ms, progress: mine }
}

const progressFor = (d: SessionDeps) => async (id: string, instructorId: string): Outcome<Fields> => {
  if (!(await visibleTo(d, await d.sessions.find(id), instructorId))) return err(noAccess())
  const data = await d.sessions.withResults(id)
  if (data === null) return err(noAccess())
  const list = Array.isArray(data.session.participants) ? (data.session.participants as Plain[]) : []
  return ok({ session: data.session, participants: list.map(participantProgress(data.results)) })
}

// ── Detalle, análisis y Excel ─────────────────────────────────────────────────

// Lo consultan el detalle (cada 15 s por pestaña con la sesión activa), el análisis y el Excel: se calcula
// una vez cada 10 s por sesión y se comparte
const detail = (d: SessionDeps) => (id: string): Outcome<SessionDetail> =>
  d.cache.remember({ namespace: detailNamespace(id), key: 'progress-admin', ttlSeconds: DETAIL_TTL_S }, async () => {
    const input = await d.sessions.detailInput(id)
    return input === null ? err(sessionNotFound()) : ok(sessionDetail(input))
  })

const viewing = <T>(d: SessionDeps, run: (id: string, extra: string) => Outcome<T>) =>
  async (id: string, r: Requester, extra = ''): Outcome<T> => andThen(assertCanView(d, id, r), () => run(id, extra))

const analysis = (d: SessionDeps) => (id: string, userId: string): Outcome<Fields> =>
  andThen(detail(d)(id), async (data) => andThen(participantIndex(data, userId), async (index) =>
    ok(participantAnalysis({ detail: data, userId, ...(await d.sessions.analysisInput(id, userId)) }, index))))

const workbook = (d: SessionDeps) => (id: string) =>
  andThen(detail(d)(id), async (data) => ok({ workbook: sessionWorkbook(data, await d.sessions.exportAttempts(id), d.now()), code: data.session.code }))

// ── Composición ───────────────────────────────────────────────────────────────

const writes = (d: SessionDeps) => ({
  create: (instructorId: string, body: Fields) => andThen(toNewSession(body), open(d, instructorId)),
  join: join(d),
  start: transition(d, () => ({ status: 'active', started_at: d.now() })),
  end: transition(d, () => ({ status: 'finished', ended_at: d.now() })),
})

const listings = (d: SessionDeps) => ({
  byCode: async (code: string): Outcome<Plain> =>
    andThen(toRoomCode(code), async (c) => fromNullable(await d.sessions.liveByCode(c), noLiveSession)),
  mine: async (instructorId: string) => d.sessions.mine(instructorId, await d.sessions.profileLocation(instructorId)),
  byLocation: (filter: PlaceFilter) => d.sessions.byLocation(filter),
  all: () => d.sessions.all(),
})

const details = (d: SessionDeps) => ({
  progress: progressFor(d),
  detail: viewing(d, (id) => detail(d)(id)),
  analysis: viewing(d, analysis(d)),
  workbook: viewing(d, (id) => workbook(d)(id)),
})

// La sala "Juego libre" del jugador cuando el juego no manda sala; se cachea 10 min por jugador
const freeSessions = (d: SessionDeps) => ({
  resolve: (userId: string, sessionId: unknown): Promise<unknown> => sessionId ? Promise.resolve(sessionId) : d.cache.remember(
    { namespace: 'free-session', key: userId, ttlSeconds: FREE_SESSION_TTL_S }, () => d.sessions.freeSessionFor(userId)),
})

export const makeSessions = (d: SessionDeps) => ({ ...writes(d), ...listings(d), ...details(d), freeSessions: freeSessions(d) })

export type Sessions = ReturnType<typeof makeSessions>
