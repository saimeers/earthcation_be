import { fn, Op, literal } from 'sequelize'
import type {
  AnalysisQueryResult, CreateRoomInput, PlaceFilter, RoomByCode, RoomView, RoomStatus, RoomWithResults,
  SessionRepository, SessionRow,
} from '@earthcation/model'
import type { Models } from '../models'
import { EVENT_COUNT, ofSession, plain, plainOrNull, rows, withRiskLevel } from './queries'

const textOr = (v: unknown): string | null => (typeof v === 'string' ? v : null)

const toRoom = (r: SessionRow): RoomView => ({
  id: String(r.id), instructorId: textOr(r.instructor_id), locationId: textOr(r.location_id),
  isFreePlay: r.is_free_play === true, status: r.status as RoomStatus,
})

const LIVE_FIRST = literal("CASE WHEN status = 'finished' THEN 1 ELSE 0 END")
const placeWhere = (f: PlaceFilter): Record<string, unknown> => Object.fromEntries(Object.entries(f).filter(([, v]) => Boolean(v)))

/** Salas de capacitación: crear, unirse, iniciar, terminar, listar y el progreso simple del instructor dueño. */
export class SequelizeSessionRepository implements SessionRepository {
  constructor(private readonly models: Models) {}

  async codeInUse(code: string): Promise<boolean> {
    return (await this.models.TrainingSession.count({ where: { code, status: { [Op.ne]: 'finished' } } })) > 0
  }

  async create(input: CreateRoomInput): Promise<SessionRow> {
    return plain(await this.models.TrainingSession.create({
      instructor_id: input.instructorId, location_id: input.locationId, name: input.name, code: input.code, status: 'waiting',
    }))
  }

  async findByCode(code: unknown): Promise<RoomByCode | null> {
    const found = await this.models.TrainingSession.findOne({
      where: { code, is_free_play: false }, order: [[LIVE_FIRST, 'ASC'], ['created_at', 'DESC']],
    })
    return found ? { room: toRoom(plain(found)), view: plain(found) } : null
  }

  async liveByCode(code: string): Promise<SessionRow | null> {
    return plainOrNull(await this.models.TrainingSession.findOne({
      where: { code, is_free_play: false, status: { [Op.ne]: 'finished' } }, attributes: ['id', 'name', 'code', 'status'],
      include: [{ model: this.models.User, as: 'instructor', attributes: ['first_name', 'last_name'] }],
    }))
  }

  async isEnrolled(sessionId: string, userId: string): Promise<boolean> {
    return (await this.models.SessionUser.count({ where: { session_id: sessionId, user_id: userId } })) > 0
  }

  async enroll(sessionId: string, userId: string): Promise<void> {
    await this.models.SessionUser.create({ session_id: sessionId, user_id: userId })
  }

  async find(id: string): Promise<RoomView | null> {
    const r = await this.models.TrainingSession.findByPk(id)
    return r ? toRoom(plain(r)) : null
  }

  async update(id: string, values: SessionRow): Promise<SessionRow> {
    await this.models.TrainingSession.update(values, { where: { id } })
    return plainOrNull(await this.models.TrainingSession.findByPk(id)) ?? {}
  }

  async profileLocation(userId: string): Promise<string | null> {
    const profile = await this.models.UserProfile.findOne({ where: { user_id: userId }, attributes: ['location_id'] })
    return profile ? textOr(plain(profile).location_id) : null
  }

  // Sus salas + la sesión "Juego libre" de su localidad
  mine(instructorId: string, locationId: string | null): Promise<readonly SessionRow[]> {
    return rows(this.models.TrainingSession.findAll({
      where: locationId ? { [Op.or]: [{ instructor_id: instructorId }, { is_free_play: true, location_id: locationId }] } : { instructor_id: instructorId },
      include: [{ association: 'participants' }], order: [['created_at', 'DESC']],
    }))
  }

  byLocation(f: PlaceFilter): Promise<readonly SessionRow[]> {
    const where = placeWhere(f)
    const filtering = Object.keys(where).length > 0
    return rows(this.models.TrainingSession.findAll({
      include: [{ model: this.models.Location, as: 'location', where: filtering ? where : undefined, required: filtering },
        { model: this.models.User, as: 'instructor', attributes: ['id', 'first_name', 'last_name', 'cedula'] }, { association: 'participants' }],
      order: [['created_at', 'DESC']],
    }))
  }

  all(): Promise<readonly SessionRow[]> {
    return rows(this.models.TrainingSession.findAll({
      include: [{ model: this.models.Location, as: 'location' }, { model: this.models.User, as: 'instructor', attributes: ['id', 'first_name', 'last_name', 'email'] },
        { model: this.models.SessionUser, as: 'participants' }],
      order: [['created_at', 'DESC']],
    }))
  }

  async withResults(id: string): Promise<RoomWithResults | null> {
    const session = await this.models.TrainingSession.findByPk(id, { include: [{ association: 'participants', include: [{
      association: 'user', attributes: ['id', 'first_name', 'last_name', 'username', 'cedula'], include: [{ association: 'varkProfile', attributes: ['dominant_style'] }],
    }] }] })
    if (!session) return null
    const view = plain(session)
    const userIds = (view.participants as SessionRow[]).map((p) => p.user_id)
    return { session: view, results: await rows(this.models.UserRiskProgress.findAll({ where: { session_id: id, user_id: { [Op.in]: userIds } }, include: [withRiskLevel(this.models)] })) }
  }

  async analysisInput(id: string, userId: string): Promise<AnalysisQueryResult> {
    const [user, attempts, eventCounts, readTimes] = await Promise.all([
      this.analysisUser(userId),
      rows(this.models.LevelAttempt.findAll({ where: { session_id: id, user_id: userId }, include: [{ model: this.models.Level, as: 'level' }], order: [['started_at', 'ASC']] })),
      this.models.GameEvent.findAll({ attributes: ['event_type', [EVENT_COUNT, 'count']], where: { user_id: userId }, include: [ofSession(this.models, id)], group: ['event_type'], raw: true }) as unknown as Promise<readonly SessionRow[]>,
      this.readTimes(id),
    ])
    return { user, attempts, eventCounts, readTimes }
  }

  exportAttempts(id: string): Promise<readonly SessionRow[]> {
    return rows(this.models.LevelAttempt.findAll({
      where: { session_id: id }, include: [{ model: this.models.User, as: 'user', attributes: ['first_name', 'last_name', 'cedula'] }], order: [['started_at', 'ASC']],
    }))
  }

  private async analysisUser(userId: string): Promise<SessionRow | null> {
    return plainOrNull(await this.models.User.findByPk(userId, {
      attributes: ['id', 'first_name', 'last_name', 'username', 'cedula', 'email', 'age'],
      include: [{ association: 'varkProfile', attributes: ['dominant_style', 'visual_score', 'auditory_score', 'reading_score'] },
        { association: 'profile', include: [{ association: 'organization' }, { association: 'location' }] }],
    }))
  }

  // Tiempo leyendo paneles informativos, por jugador de la sesión
  private readTimes(id: string): Promise<readonly SessionRow[]> {
    return this.models.GameEvent.findAll({
      attributes: ['user_id', [fn('AVG', literal("(payload->>'read_ms')::float")), 'avg_read_ms'], [EVENT_COUNT, 'panels']],
      where: { event_type: 'risk_info_closed' }, include: [ofSession(this.models, id)], group: ['GameEvent.user_id'], raw: true,
    }) as unknown as Promise<readonly SessionRow[]>
  }
}
