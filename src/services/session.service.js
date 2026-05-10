const { TrainingSession, SessionUser, User, UserRiskProgress, Risk, Level, UserProfile, Location } = require('../models');
const { generateSessionCode } = require('../utils/session.utils');

const createSession = async (instructorId, { name }) => {
  let code, exists;
  do {
    code  = generateSessionCode();
    exists = await TrainingSession.findOne({ where: { code } });
  } while (exists);

  return TrainingSession.create({
    instructor_id: instructorId,
    name,
    code,
    status: 'waiting'
  });
};

const joinSession = async (userId, code) => {
  const session = await TrainingSession.findOne({ where: { code } });
  if (!session) {
    const error = new Error('Código de sesión inválido');
    error.status = 404;
    throw error;
  }
  if (session.status === 'finished') {
    const error = new Error('Esta sesión ya ha finalizado');
    error.status = 400;
    throw error;
  }

  const already = await SessionUser.findOne({
    where: { session_id: session.id, user_id: userId }
  });
  if (already) {
    return { session, joined: false, message: 'Ya estás en esta sesión' };
  }

  await SessionUser.create({ session_id: session.id, user_id: userId });
  return { session, joined: true };
};

const startSession = async (sessionId, instructorId) => {
  const session = await TrainingSession.findByPk(sessionId);
  if (!session || session.instructor_id !== instructorId) {
    const error = new Error('Sesión no encontrada o sin permiso');
    error.status = 403;
    throw error;
  }
  return session.update({ status: 'active', started_at: new Date() });
};

const endSession = async (sessionId, instructorId) => {
  const session = await TrainingSession.findByPk(sessionId);
  if (!session || session.instructor_id !== instructorId) {
    const error = new Error('Sesión no encontrada o sin permiso');
    error.status = 403;
    throw error;
  }
  return session.update({ status: 'finished', ended_at: new Date() });
};

const getSessionProgress = async (sessionId, instructorId) => {
  const session = await TrainingSession.findByPk(sessionId, {
    include: [{
      association: 'participants',
      include: [{
        association: 'user',
        attributes: ['id', 'first_name', 'last_name', 'username', 'cedula'],
        include: [{ association: 'varkProfile', attributes: ['dominant_style'] }]
      }]
    }]
  });

  if (!session || session.instructor_id !== instructorId) {
    const error = new Error('Sesión no encontrada o sin permiso');
    error.status = 403;
    throw error;
  }

  const participants = await Promise.all(
    session.participants.map(async (su) => {
      const progress = await UserRiskProgress.findAll({
        where: { user_id: su.user_id, session_id: sessionId },
        include: [{ model: Risk, as: 'risk', include: [{ model: Level, as: 'level' }] }]
      });

      const total     = progress.length;
      const mitigated = progress.filter(p => p.is_mitigated).length;
      const avgTime   = total > 0
        ? progress.reduce((acc, p) => acc + (p.reaction_time_ms || 0), 0) / total
        : null;

      return {
        user:           su.user,
        dominant_style: su.user?.varkProfile?.dominant_style || null,
        total_attempts: total,
        mitigated,
        percentage:     total > 0 ? Math.round((mitigated / total) * 100) : 0,
        avg_reaction_ms: avgTime ? Math.round(avgTime) : null,
        progress
      };
    })
  );

  return { session, participants };
};

const getMySessions = async (instructorId) => {
  return TrainingSession.findAll({
    where: { instructor_id: instructorId },
    include: [{ association: 'participants' }],
    order: [['created_at', 'DESC']]
  });
};

const getSessionsByLocation = async ({ department, municipality }) => {
  const locationWhere = {};
  if (department)   locationWhere.department   = department;
  if (municipality) locationWhere.municipality = municipality;

  return TrainingSession.findAll({
    include: [
      {
        model: User,
        as: 'instructor',
        attributes: ['id', 'first_name', 'last_name', 'cedula'],
        required: true,
        include: [{
          model: UserProfile,
          as: 'profile',
          required: true,
          include: [{
            model: Location,
            as: 'location',
            where: locationWhere,
            required: true
          }]
        }]
      },
      { association: 'participants' }
    ],
    order: [['created_at', 'DESC']]
  });
};

const getAllSessions = async () => {
  return TrainingSession.findAll({
    include: [
      { model: User, as: 'instructor', attributes: ['id', 'first_name', 'last_name', 'email'] },
      { model: SessionUser, as: 'participants' },
    ],
    order: [['created_at', 'DESC']],
  });
};

module.exports = { getAllSessions, createSession, joinSession, startSession, endSession, getSessionProgress, getMySessions, getSessionsByLocation };