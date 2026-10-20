import { col, fn, literal, Op, type IncludeOptions, type Model } from 'sequelize'
import models from '../../models'
import { keyOf } from '../../shared/collections'
import type { Plain } from './detail'
import type { Session, Status } from './domain'
import type { PlaceFilter, SessionRepository } from './ports'

const plain = (m: Model): Plain => m.get({ plain: true }) as Plain
const plainOrNull = (m: Model | null): Plain | null => (m ? plain(m) : null)
const rows = async (p: Promise<readonly Model[]>): Promise<readonly Plain[]> => (await p).map(plain)
const textOr = (v: unknown): string | null => (typeof v === 'string' ? v : null)

const toSession = (r: Plain): Session => ({
  id: String(r.id), instructorId: textOr(r.instructor_id), locationId: textOr(r.location_id),
  isFreePlay: r.is_free_play === true, status: r.status as Status,
})

const SESSIONS = models.TrainingSession

// ── Salas ─────────────────────────────────────────────────────────────────────

const LIVE_FIRST = literal(`CASE WHEN status = 'finished' THEN 1 ELSE 0 END`)

const findByCode = async (code: unknown) => {
  const found = await SESSIONS.findOne({ where: { code, is_free_play: false }, order: [[LIVE_FIRST, 'ASC'], ['created_at', 'DESC']] })
  return found ? { session: toSession(plain(found)), view: plain(found) } : null
}

const liveByCode = async (code: string) => plainOrNull(await SESSIONS.findOne({
  where: { code, is_free_play: false, status: { [Op.ne]: 'finished' } }, attributes: ['id', 'name', 'code', 'status'],
  include: [{ model: models.User, as: 'instructor', attributes: ['first_name', 'last_name'] }],
}))

const update = async (id: string, values: Plain): Promise<Plain> => {
  await SESSIONS.update(values, { where: { id } })
  return plainOrNull(await SESSIONS.findByPk(id)) ?? {}
}

const profileLocation = async (userId: string): Promise<string | null> => {
  const profile = await models.UserProfile.findOne({ where: { user_id: userId }, attributes: ['location_id'] })
  return profile ? textOr(plain(profile).location_id) : null
}

// Sus salas + la sesión "Juego libre" de su localidad
const mine = (instructorId: string, locationId: string | null) => rows(SESSIONS.findAll({
  where: locationId ? { [Op.or]: [{ instructor_id: instructorId }, { is_free_play: true, location_id: locationId }] } : { instructor_id: instructorId },
  include: [{ association: 'participants' }], order: [['created_at', 'DESC']],
}))

const placeWhere = (f: PlaceFilter) => Object.fromEntries(Object.entries(f).filter(([, v]) => Boolean(v)))

const byLocation = (f: PlaceFilter) => {
  const where = placeWhere(f)
  const filtering = Object.keys(where).length > 0
  return rows(SESSIONS.findAll({
    include: [{ model: models.Location, as: 'location', where: filtering ? where : undefined, required: filtering },
      { model: models.User, as: 'instructor', attributes: ['id', 'first_name', 'last_name', 'cedula'] }, { association: 'participants' }],
    order: [['created_at', 'DESC']],
  }))
}

const all = () => rows(SESSIONS.findAll({
  include: [{ model: models.Location, as: 'location' }, { model: models.User, as: 'instructor', attributes: ['id', 'first_name', 'last_name', 'email'] },
    { model: models.SessionUser, as: 'participants' }],
  order: [['created_at', 'DESC']],
}))

// ── Progreso, detalle y análisis ──────────────────────────────────────────────

const withRiskLevel: IncludeOptions = { model: models.Risk, as: 'risk', include: [{ model: models.Level, as: 'level' }] }

const withResults = async (id: string) => {
  const session = await SESSIONS.findByPk(id, { include: [{ association: 'participants', include: [{
    association: 'user', attributes: ['id', 'first_name', 'last_name', 'username', 'cedula'], include: [{ association: 'varkProfile', attributes: ['dominant_style'] }],
  }] }] })
  if (!session) return null
  const view = plain(session)
  const userIds = (view.participants as Plain[]).map((p) => p.user_id)
  return { session: view, results: await rows(models.UserRiskProgress.findAll({ where: { session_id: id, user_id: { [Op.in]: userIds } }, include: [withRiskLevel] })) }
}

const PARTICIPANT_USER: IncludeOptions = {
  model: models.User, as: 'user', attributes: ['id', 'first_name', 'last_name', 'username', 'cedula'], include: [
    { association: 'varkProfile', attributes: ['dominant_style'] },
    { association: 'profile', attributes: ['organization_id'], include: [{ association: 'organization', attributes: ['id', 'name'] }] },
  ],
}

const detailSession = async (id: string) => plainOrNull(await SESSIONS.findByPk(id, {
  include: [{ model: models.User, as: 'instructor', attributes: ['id', 'first_name', 'last_name', 'email'] },
    { model: models.Location, as: 'location', attributes: ['id', 'municipality', 'department'] },
    { model: models.SessionUser, as: 'participants', include: [PARTICIPANT_USER] }],
  order: [[{ model: models.SessionUser, as: 'participants' }, 'joined_at', 'ASC']],
}))

const detailInput = async (id: string) => {
  const session = await detailSession(id)
  if (session === null) return null
  const [results, attempts] = await Promise.all([
    rows(models.UserRiskProgress.findAll({ where: { session_id: id }, include: [withRiskLevel], order: [['recorded_at', 'ASC']] })),
    rows(models.LevelAttempt.findAll({ where: { session_id: id }, attributes: { exclude: ['summary'] }, order: [['started_at', 'ASC']] })),
  ])
  return { session, results, attempts }
}

const ofSession = (id: string): IncludeOptions => ({ model: models.LevelAttempt, as: 'attempt', attributes: [], where: { session_id: id } })
const EVENT_COUNT = fn('COUNT', col('GameEvent.id'))

const analysisUser = async (userId: string) => plainOrNull(await models.User.findByPk(userId, {
  attributes: ['id', 'first_name', 'last_name', 'username', 'cedula', 'email', 'age'],
  include: [{ association: 'varkProfile', attributes: ['dominant_style', 'visual_score', 'auditory_score', 'reading_score'] },
    { association: 'profile', include: [{ association: 'organization' }, { association: 'location' }] }],
}))

// Tiempo leyendo paneles informativos, por jugador de la sesión
const readTimes = (id: string) => models.GameEvent.findAll({
  attributes: ['user_id', [fn('AVG', literal("(payload->>'read_ms')::float")), 'avg_read_ms'], [EVENT_COUNT, 'panels']],
  where: { event_type: 'risk_info_closed' }, include: [ofSession(id)], group: ['GameEvent.user_id'], raw: true,
}) as unknown as Promise<readonly Plain[]>

const analysisInput = async (id: string, userId: string) => {
  const [user, attempts, eventCounts, reads] = await Promise.all([
    analysisUser(userId),
    rows(models.LevelAttempt.findAll({ where: { session_id: id, user_id: userId }, include: [{ model: models.Level, as: 'level' }], order: [['started_at', 'ASC']] })),
    models.GameEvent.findAll({ attributes: ['event_type', [EVENT_COUNT, 'count']], where: { user_id: userId }, include: [ofSession(id)], group: ['event_type'], raw: true }) as unknown as Promise<readonly Plain[]>,
    readTimes(id),
  ])
  return { user, attempts, eventCounts, readTimes: reads }
}

// ── Juego libre ───────────────────────────────────────────────────────────────

// Quien juega sin código de sala cae en la sesión libre de la localidad de su perfil; sin localidad, en una
// global. Sin instructor ni código, siempre activa. Se crea la primera vez y el jugador queda inscrito.
const profilePlace = async (userId: string): Promise<Plain | null> => {
  const profile = await models.UserProfile.findOne({ where: { user_id: userId }, include: [{ model: models.Location, as: 'location' }] })
  return (profile ? plain(profile).location : null) as Plain | null
}

const freeSessionDefaults = (location: Plain | null) => ({
  name: location ? `Juego libre – ${keyOf(location.municipality)}` : 'Juego libre', status: 'active', started_at: new Date(), instructor_id: null, code: null,
})

const freeSessionFor = async (userId: string): Promise<string> => {
  const location = await profilePlace(userId)
  const [session] = await SESSIONS.findOrCreate({
    where: { is_free_play: true, location_id: location ? location.id : null }, defaults: freeSessionDefaults(location),
  })
  const id = keyOf(plain(session).id)
  await models.SessionUser.findOrCreate({ where: { session_id: id, user_id: userId } })
  return id
}

export const sessionRepository: SessionRepository = {
  findByCode, liveByCode, update, profileLocation, mine, byLocation, all, withResults, detailInput, analysisInput, freeSessionFor,
  codeInUse: async (code) => (await SESSIONS.count({ where: { code, status: { [Op.ne]: 'finished' } } })) > 0,
  create: async (s) => plain(await SESSIONS.create({ instructor_id: s.instructorId, location_id: s.locationId, name: s.name, code: s.code, status: 'waiting' })),
  isEnrolled: async (sessionId, userId) => (await models.SessionUser.count({ where: { session_id: sessionId, user_id: userId } })) > 0,
  enroll: async (sessionId, userId) => { await models.SessionUser.create({ session_id: sessionId, user_id: userId }) },
  find: async (id) => { const r = await SESSIONS.findByPk(id); return r ? toSession(plain(r)) : null },
  exportAttempts: (id) => rows(models.LevelAttempt.findAll({
    where: { session_id: id }, include: [{ model: models.User, as: 'user', attributes: ['first_name', 'last_name', 'cedula'] }], order: [['started_at', 'ASC']],
  })),
}
