const { UserRiskProgress, Risk, Level } = require('../models');

const saveProgress = async (userId, { risk_id, session_id, is_mitigated, mistakes_count, reaction_time_ms }) => {
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
    is_mitigated:     is_mitigated     ?? false,
    mistakes_count:   mistakes_count   ?? 0,
    reaction_time_ms: reaction_time_ms ?? null
  });
};

const getFullProgress = async (userId) => {
  return UserRiskProgress.findAll({
    where: { user_id: userId },
    include: [{
      model: Risk, as: 'risk',
      include: [{ model: Level, as: 'level' }]
    }],
    order: [['recorded_at', 'DESC']]
  });
};

const getProgressByLevel = async (userId, levelId) => {
  const risks = await Risk.findAll({
    where: { level_id: levelId },
    include: [{
      model:    UserRiskProgress,
      as:       'attempts',
      where:    { user_id: userId },
      required: false,
      limit:    1,
      order:    [['recorded_at', 'DESC']]
    }]
  });

  const mapped = risks.map(r => ({
    risk_id:          r.id,
    risk_name:        r.name,
    category:         r.category,
    mitigated:        r.attempts?.[0]?.is_mitigated     ?? false,
    last_mistakes:    r.attempts?.[0]?.mistakes_count   ?? null,
    last_reaction_ms: r.attempts?.[0]?.reaction_time_ms ?? null
  }));

  const total     = mapped.length;
  const mitigated = mapped.filter(r => r.mitigated).length;

  return {
    level_id:   levelId,
    completion: `${mitigated}/${total}`,
    percentage: total > 0 ? Math.round((mitigated / total) * 100) : 0,
    risks:      mapped
  };
};

module.exports = { saveProgress, getFullProgress, getProgressByLevel };