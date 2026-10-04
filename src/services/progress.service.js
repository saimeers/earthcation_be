const { UserRiskProgress, Risk, Level } = require('../models');
const { latestAttemptByLevel } = require('../utils/attempt.utils');

const saveProgress = async (userId, { risk_id, session_id, attempt_id, is_mitigated, mistakes_count, reaction_time_ms, detail }) => {
  const risk = await Risk.findByPk(risk_id);
  if (!risk) {
    const error = new Error('Riesgo no encontrado');
    error.status = 404;
    throw error;
  }

  return UserRiskProgress.create({
    user_id:          userId,
    risk_id,
    session_id:       session_id       || null,
    attempt_id:       attempt_id       || null,
    detail:           detail           || null,
    is_mitigated:     is_mitigated     ?? false,
    mistakes_count:   mistakes_count   ?? 0,
    reaction_time_ms: reaction_time_ms ?? null
  });
};

const getFullMeProgress = async (userId) => {
  return UserRiskProgress.findAll({
    where: { user_id: userId },
    include: [{
      model: Risk, as: 'risk',
      include: [{ model: Level, as: 'level' }]
    }],
    order: [['recorded_at', 'DESC']]
  });
};

const getSessionProgress = async (sessionId, userId) => {
  return UserRiskProgress.findAll({
    where: { session_id: sessionId, user_id: userId },
    include: [{ model: Risk, as: 'risk', include: [{ model: Level, as: 'level' }] }],
    order: [['recorded_at', 'DESC']]
  });
};

const getProgressByLevel = async (userId, levelId) => {
  // Solo el último intento del jugador en este nivel: reintentar reemplaza el %, no lo promedia
  const risks = await Risk.findAll({ where: { level_id: levelId } });
  const rows = await UserRiskProgress.findAll({
    where: { user_id: userId, risk_id: risks.map(r => r.id) },
    include: [{ model: Risk, as: 'risk', attributes: ['level_id'] }],
  });
  const latest = latestAttemptByLevel(rows)[0];
  const latestRows = latest?.rows ?? [];

  const mapped = risks.map(r => {
    const results = latestRows.filter(p => p.risk_id === r.id);
    const last = results.sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at))[0];
    return {
      risk_id:          r.id,
      risk_name:        r.name,
      category:         r.category,
      mitigated:        results.length > 0 && results.every(p => p.is_mitigated),
      last_mistakes:    last?.mistakes_count   ?? null,
      last_reaction_ms: last?.reaction_time_ms ?? null
    };
  });

  return {
    level_id:   levelId,
    completion: `${latest?.mitigated ?? 0}/${latest?.total ?? 0}`,
    percentage: latest?.percentage ?? 0,
    attempts:   latest?.attempts_count ?? 0,
    risks:      mapped
  };
};

const getHistoryByUser = async (userId, sessionId) => {
  const where = { user_id: userId }
  if (sessionId) where.session_id = sessionId

  return UserRiskProgress.findAll({
    where,
    include: [{
      model: Risk, as: 'risk',
      include: [{ model: Level, as: 'level' }]
    }],
    order: [['recorded_at', 'DESC']]
  })
}

module.exports = { saveProgress, getFullMeProgress, getSessionProgress, getProgressByLevel, getHistoryByUser };