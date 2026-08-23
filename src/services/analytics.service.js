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

  // Riesgos más fallados — agrupado sobre columnas ya existentes (risk_id, is_mitigated),
  // sin necesitar campos nuevos en BD.
  const allProgress = await UserRiskProgress.findAll({
    attributes: ['risk_id', 'is_mitigated', 'mistakes_count'],
    include: [{ model: Risk, as: 'risk', attributes: ['name', 'category'] }],
  });
  const riskStats = {};
  allProgress.forEach(p => {
    const key = p.risk_id;
    if (!riskStats[key]) {
      riskStats[key] = {
        risk_id: key,
        name: p.risk?.name ?? key,
        category: p.risk?.category ?? null,
        total: 0, failed: 0, mistakes_sum: 0,
      };
    }
    riskStats[key].total++;
    if (!p.is_mitigated) riskStats[key].failed++;
    riskStats[key].mistakes_sum += p.mistakes_count || 0;
  });
  const riesgosMasFallados = Object.values(riskStats)
    .map(r => ({
      risk_id: r.risk_id,
      name: r.name,
      category: r.category,
      total_attempts: r.total,
      failed: r.failed,
      fail_rate: r.total > 0 ? Math.round((r.failed / r.total) * 100) : 0,
      avg_mistakes: r.total > 0 ? Math.round((r.mistakes_sum / r.total) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.fail_rate - a.fail_rate || b.total_attempts - a.total_attempts)
    .slice(0, 8);

  // Tendencia temporal — mitigaciones por semana, últimas 8 semanas con datos.
  const weeklyRows = await UserRiskProgress.findAll({
    attributes: [
      [fn('date_trunc', 'week', col('recorded_at')), 'week'],
      [fn('COUNT', col('UserRiskProgress.id')), 'total'],
      [fn('SUM', literal('CASE WHEN is_mitigated THEN 1 ELSE 0 END')), 'mitigated'],
    ],
    group: [literal("date_trunc('week', recorded_at)")],
    order: [[literal("date_trunc('week', recorded_at)"), 'ASC']],
    raw: true,
  });
  const tendenciaTemporal = weeklyRows.slice(-8).map(r => ({
    week: r.week,
    total: parseInt(r.total),
    mitigated: parseInt(r.mitigated),
    percentage: parseInt(r.total) > 0 ? Math.round((parseInt(r.mitigated) / parseInt(r.total)) * 100) : 0,
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
    riesgos_mas_fallados: riesgosMasFallados,
    tendencia_temporal: tendenciaTemporal,
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

// Mapa de unidades mineras — Organization no tiene location_id propio, así que la ubicación se
// infiere como el departamento/municipio más frecuente entre los perfiles de sus jugadores
// (una organización con gente repartida en varios sitios se ubica donde tiene más jugadores).
const getMinesMap = async () => {
  const organizations = await Organization.findAll({ where: { is_active: true } });
  if (!organizations.length) return [];

  const profiles = await UserProfile.findAll({
    where: { organization_id: { [Op.in]: organizations.map(o => o.id) } },
    include: [
      { model: User, as: 'user', attributes: ['id'], where: { is_active: true } },
      { model: Location, as: 'location', attributes: ['municipality', 'department'] },
    ],
  });

  const progress = await UserRiskProgress.findAll({ attributes: ['user_id', 'is_mitigated'] });
  const progressByUser = {};
  progress.forEach(p => {
    if (!progressByUser[p.user_id]) progressByUser[p.user_id] = { total: 0, mitigated: 0 };
    progressByUser[p.user_id].total++;
    if (p.is_mitigated) progressByUser[p.user_id].mitigated++;
  });

  return organizations.map(org => {
    const orgProfiles = profiles.filter(p => p.organization_id === org.id);
    const locationCounts = {};
    orgProfiles.forEach(p => {
      if (!p.location) return;
      const key = `${p.location.municipality}|${p.location.department}`;
      locationCounts[key] = (locationCounts[key] || 0) + 1;
    });
    const topLocationKey = Object.entries(locationCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const [municipality, department] = topLocationKey ? topLocationKey.split('|') : [null, null];

    let total = 0, mitigated = 0;
    orgProfiles.forEach(p => {
      const stats = progressByUser[p.user_id];
      if (stats) { total += stats.total; mitigated += stats.mitigated; }
    });

    return {
      id: org.id,
      name: org.name,
      municipality,
      department,
      player_count: orgProfiles.length,
      percentage: total > 0 ? Math.round((mitigated / total) * 100) : 0,
    };
  }).filter(o => o.department);
};

module.exports = { getOverview, getByOrganization, getByLocation, getMinesMap };