const { User, UserProfile, UserRiskProgress, VarkResult, Organization, Location, TrainingSession, SessionUser, Risk, Level } = require('../models');
const { Op, fn, col, literal } = require('sequelize');

const getOverview = async () => {
  const totalUsers       = await User.count();
  const totalPlayers     = await User.count({ where: { role: 'player' } });
  const totalInstructors = await User.count({ where: { role: 'instructor' } });
  const totalSessions    = await TrainingSession.count();
  const activeSessions   = await TrainingSession.count({ where: { status: 'active' } });
  const totalAttempts    = await UserRiskProgress.count();
  const totalMitigated   = await UserRiskProgress.count({ where: { is_mitigated: true } });

  const varkCounts = await VarkResult.findAll({
    attributes: ['dominant_style', [fn('COUNT', col('id')), 'count']],
    group: ['dominant_style'],
  });

  // Progreso por nivel
  const risksByLevel = await Risk.findAll({
    include: [{ model: Level, as: 'level', attributes: ['id', 'name'] }],
    attributes: ['id', 'level_id'],
  });

  const levelStats = {};
  risksByLevel.forEach(r => {
    const name = r.level?.name ?? `Nivel ${r.level_id}`;
    if (!levelStats[name]) levelStats[name] = { total: 0, mitigated: 0 };
    levelStats[name].total++;
  });

  const mitigatedByLevel = await UserRiskProgress.findAll({
    where: { is_mitigated: true },
    include: [{ model: Risk, as: 'risk', attributes: ['level_id'] }],
    attributes: ['risk_id'],
  });

  mitigatedByLevel.forEach(p => {
    const risk = p.risk;
    if (!risk) return;
    const level = risksByLevel.find(r => r.id === risk.level_id);
    const name  = level?.level?.name ?? `Nivel ${risk.level_id}`;
    if (levelStats[name]) levelStats[name].mitigated++;
  });

  const progressByLevel = Object.entries(levelStats).map(([name, s]) => ({
    level: name,
    percentage: s.total > 0 ? Math.round((s.mitigated / s.total) * 100) : 0,
    mitigated: s.mitigated,
    total: s.total,
  }));

  return {
    users: { total: totalUsers, players: totalPlayers, instructors: totalInstructors },
    sessions: { total: totalSessions, active: activeSessions },
    progress: {
      total_attempts:    totalAttempts,
      total_mitigated:   totalMitigated,
      global_percentage: totalAttempts > 0 ? Math.round((totalMitigated / totalAttempts) * 100) : 0,
    },
    vark_distribution: varkCounts.map(v => ({
      style: v.dominant_style ?? 'Sin completar',
      count: parseInt(v.dataValues.count),
    })),
    progress_by_level: progressByLevel,
  };
};

const getByOrganization = async (organizationId) => {
  const profiles = await UserProfile.findAll({
    where: { organization_id: organizationId },
    include: [{ model: User, as: 'user', attributes: ['id', 'first_name', 'last_name', 'cedula'] }],
  });
  if (!profiles.length) return [];

  return Promise.all(profiles.map(async p => {
    const progress  = await UserRiskProgress.findAll({ where: { user_id: p.user_id } });
    const vark      = await VarkResult.findOne({ where: { user_id: p.user_id } });
    const mitigated = progress.filter(r => r.is_mitigated).length;
    return {
      user: p.user,
      dominant_style: vark?.dominant_style ?? null,
      total_attempts: progress.length,
      mitigated,
      percentage: progress.length > 0 ? Math.round((mitigated / progress.length) * 100) : 0,
    };
  }));
};

const getByLocation = async ({ department, municipality }) => {
  const where = {};
  if (department)   where.department   = department;
  if (municipality) where.municipality = municipality;

  const locations   = await Location.findAll({ where });
  const locationIds = locations.map(l => l.id);
  if (!locationIds.length) return [];

  const profiles = await UserProfile.findAll({
    where: { location_id: { [Op.in]: locationIds } },
    include: [
      { model: User,     as: 'user',     attributes: ['id', 'first_name', 'last_name', 'cedula'] },
      { model: Location, as: 'location', attributes: ['municipality', 'department'] },
    ],
  });
  if (!profiles.length) return [];

  return Promise.all(profiles.map(async p => {
    const progress  = await UserRiskProgress.findAll({ where: { user_id: p.user_id } });
    const vark      = await VarkResult.findOne({ where: { user_id: p.user_id } });
    const mitigated = progress.filter(r => r.is_mitigated).length;
    return {
      user: p.user, location: p.location,
      dominant_style: vark?.dominant_style ?? null,
      total_attempts: progress.length,
      mitigated,
      percentage: progress.length > 0 ? Math.round((mitigated / progress.length) * 100) : 0,
    };
  }));
};

module.exports = { getOverview, getByOrganization, getByLocation };