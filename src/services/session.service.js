const { TrainingSession, SessionUser, User, UserRiskProgress, Risk, Level, UserProfile, Location } = require('../models');
const { generateSessionCode } = require('../utils/session.utils');

const createSession = async (instructorId, { name, location_id }) => {
  let code, exists;
  do {
    code  = generateSessionCode();
    exists = await TrainingSession.findOne({ where: { code } });
  } while (exists);

  return TrainingSession.create({
    instructor_id: instructorId,
    location_id: location_id,
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

  const isFiltering = Object.keys(locationWhere).length > 0;

  return TrainingSession.findAll({
    include: [
      {
        model: Location,
        as: 'location', 
        where: isFiltering ? locationWhere : undefined,
        required: isFiltering 
      },
      {
        model: User,
        as: 'instructor',
        attributes: ['id', 'first_name', 'last_name', 'cedula']
      },
      { association: 'participants' } 
    ],
    order: [['created_at', 'DESC']]
  });
};

const getAllSessions = async () => {
  return TrainingSession.findAll({
    include: [
      { 
        model: Location, 
        as: 'location' 
      },
      { 
        model: User, 
        as: 'instructor', 
        attributes: ['id', 'first_name', 'last_name', 'email'] 
      },
      { 
        model: SessionUser, 
        as: 'participants' 
      },
    ],
    order: [['created_at', 'DESC']],
  });
};

const getSessionProgressAdmin = async (sessionId) => {
  const session = await TrainingSession.findByPk(sessionId, {
    include: [
      { model: User, as: 'instructor', attributes: ['id', 'first_name', 'last_name', 'email'] },
      {
        model: SessionUser, as: 'participants',
        include: [{
          model: User, as: 'user',
          attributes: ['id', 'first_name', 'last_name', 'username', 'cedula'],
          include: [{ association: 'varkProfile', attributes: ['dominant_style'] }]
        }]
      }
    ]
  })

  if (!session) {
    const error = new Error('Sesión no encontrada')
    error.status = 404
    throw error
  }

  const participants = await Promise.all(
    session.participants.map(async (su) => {
      const progress = await UserRiskProgress.findAll({
        where: { user_id: su.user_id, session_id: sessionId },
        include: [{ model: Risk, as: 'risk', include: [{ model: Level, as: 'level' }] }]
      })

      const total     = progress.length
      const mitigated = progress.filter(p => p.is_mitigated).length
      const avgTime   = total > 0
        ? progress.reduce((acc, p) => acc + (p.reaction_time_ms || 0), 0) / total
        : null

      // Agrupa por nivel
      const byLevel = {}
      progress.forEach(p => {
        const levelName = p.risk?.level?.name ?? 'Sin nivel'
        const levelId   = p.risk?.level?.id   ?? 'unknown'
        if (!byLevel[levelId]) byLevel[levelId] = { name: levelName, total: 0, mitigated: 0, risks: [] }
        byLevel[levelId].total++
        if (p.is_mitigated) byLevel[levelId].mitigated++
        byLevel[levelId].risks.push({
          risk_id:          p.risk_id,
          risk_name:        p.risk?.name,
          category:         p.risk?.category,
          is_mitigated:     p.is_mitigated,
          mistakes_count:   p.mistakes_count,
          reaction_time_ms: p.reaction_time_ms,
          recorded_at:      p.recorded_at,
        })
      })

      return {
        user:            su.user,
        dominant_style:  su.user?.varkProfile?.dominant_style || null,
        total_attempts:  total,
        mitigated,
        percentage:      total > 0 ? Math.round((mitigated / total) * 100) : 0,
        avg_reaction_ms: avgTime ? Math.round(avgTime) : null,
        by_level:        Object.values(byLevel),
        progress,
      }
    })
  )

  return { session, participants }
}

module.exports = { getAllSessions, createSession, joinSession, startSession, endSession, getSessionProgress, getMySessions, getSessionsByLocation, getSessionProgressAdmin };