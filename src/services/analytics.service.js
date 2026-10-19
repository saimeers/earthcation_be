const { User, UserProfile, UserRiskProgress, VarkResult, Organization, Location, TrainingSession, Risk, Level } = require('../models');
const { Op, fn, col, literal } = require('sequelize');
const { summarize, latestAttemptRows, latestAttemptByLevel } = require('../utils/attempt.utils');
const { coordsFor } = require('../utils/geo.utils');
const { remember } = require('./cache.service');

// Todos los % de éxito usan el ÚLTIMO intento de cada jugador en cada nivel (ver
// utils/attempt.utils.js): reintentar no promedia con lo anterior, reemplaza.
const progressWithLevel = (where = {}) => UserRiskProgress.findAll({
  where,
  attributes: ['id', 'user_id', 'risk_id', 'attempt_id', 'session_id', 'is_mitigated', 'mistakes_count', 'reaction_time_ms', 'recorded_at'],
  include: [{ model: Risk, as: 'risk', attributes: ['level_id', 'name', 'category'] }],
});

const userSummary = (rows) => {
  const latest = latestAttemptByLevel(rows);
  const s = summarize(latest.flatMap(l => l.rows));
  return {
    total_attempts: s.total,          // resultados de riesgo del último intento de cada nivel
    mitigated: s.mitigated,
    percentage: s.percentage,
    level_attempts: latest.reduce((a, l) => a + l.attempts_count, 0), // intentos de nivel en total (incluye reintentos)
  };
};

// Resumen por jugador para muchos usuarios con 2 consultas (antes eran 2 por usuario: N+1)
const summariesByUser = async (userIds) => {
  const [rows, varks] = await Promise.all([
    progressWithLevel({ user_id: { [Op.in]: userIds } }),
    VarkResult.findAll({ where: { user_id: { [Op.in]: userIds } }, attributes: ['user_id', 'dominant_style'] }),
  ]);
  const byUser = new Map(userIds.map(id => [id, []]));
  rows.forEach(r => byUser.get(r.user_id)?.push(r));
  const varkByUser = new Map(varks.map(v => [v.user_id, v.dominant_style]));
  return (userId) => ({ dominant_style: varkByUser.get(userId) ?? null, ...userSummary(byUser.get(userId) ?? []) });
};

// Recorre todo el historial: se cachea 60 s (lo consultan el panel y sus refrescos)
const getOverview = () => remember('analytics', 'overview', 60, computeOverview);

const computeOverview = async () => {
  const [totalUsers, totalPlayers, totalInstructors, totalSessions, activeSessions, allRows] = await Promise.all([
    User.count(),
    User.count({ where: { role: 'player' } }),
    User.count({ where: { role: 'instructor' } }),
    TrainingSession.count(),
    TrainingSession.count({ where: { status: 'active' } }),
    progressWithLevel(),
  ]);
  const latestByLevel  = latestAttemptByLevel(allRows);
  const latestSummary  = summarize(latestByLevel.flatMap(l => l.rows));

  const varkCounts = await VarkResult.findAll({
    attributes: ['dominant_style', [fn('COUNT', col('id')), 'count']],
    group: ['dominant_style'],
  });

  // Progreso por nivel: último intento de cada jugador en ese nivel
  const levels = await Level.findAll({ attributes: ['id', 'name'], order: [['id', 'ASC']] });
  const progressByLevel = levels.map(level => {
    const entries = latestByLevel.filter(l => l.level_id === level.id);
    const s = summarize(entries.flatMap(l => l.rows));
    return {
      level: level.name,
      percentage: s.percentage,
      mitigated: s.mitigated,
      total: s.total,
      players: entries.length,
      players_100: entries.filter(l => l.percentage === 100).length,
      avg_attempts: entries.length ? Math.round((entries.reduce((a, l) => a + l.attempts_count, 0) / entries.length) * 10) / 10 : 0,
    };
  });

  // Riesgos más fallados — agrupado sobre columnas ya existentes (risk_id, is_mitigated),
  // sin necesitar campos nuevos en BD.
  // (este sí usa todo el historial: mide qué tan difícil es cada riesgo, incluidos los reintentos)
  const allProgress = allRows;
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
      total_attempts:    latestSummary.total,      // resultados del último intento de cada jugador por nivel
      total_mitigated:   latestSummary.mitigated,
      global_percentage: latestSummary.percentage,
      history_results:   allRows.length,           // todos los resultados, con reintentos
      level_attempts:    latestByLevel.reduce((a, l) => a + l.attempts_count, 0),
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

  const summaryOf = await summariesByUser(profiles.map(p => p.user_id));
  return profiles.map(p => ({ user: p.user, ...summaryOf(p.user_id) }));
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

  const summaryOf = await summariesByUser(profiles.map(p => p.user_id));
  return profiles.map(p => ({ user: p.user, location: p.location, ...summaryOf(p.user_id) }));
};

// Mapa de unidades mineras — Organization no tiene location_id propio, así que la ubicación se
// infiere como el departamento/municipio más frecuente entre los perfiles de sus jugadores
// (una organización con gente repartida en varios sitios se ubica donde tiene más jugadores).
const getMinesMap = () => remember('analytics', 'mines-map', 60, computeMinesMap);

const computeMinesMap = async () => {
  const organizations = await Organization.findAll({ where: { is_active: true } });
  if (!organizations.length) return [];

  const profiles = await UserProfile.findAll({
    where: { organization_id: { [Op.in]: organizations.map(o => o.id) } },
    include: [
      { model: User, as: 'user', attributes: ['id'], where: { is_active: true } },
      { model: Location, as: 'location', attributes: ['municipality', 'department'] },
    ],
  });

  const latestRows = latestAttemptRows(await progressWithLevel({ user_id: { [Op.in]: profiles.map(p => p.user_id) } }));

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

    const orgUserIds = new Set(orgProfiles.map(p => p.user_id));
    const s = summarize(latestRows.filter(r => orgUserIds.has(r.user_id)));
    const coords = municipality ? coordsFor(municipality, department) : null;

    return {
      id: org.id,
      name: org.name,
      municipality,
      department,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      location_exact: coords?.exact ?? false, // false: el municipio no está en DIVIPOLA, se ubicó en la capital
      player_count: orgProfiles.length,
      results: s.total,
      percentage: s.percentage,
    };
  }).filter(o => o.department);
};

module.exports = { getOverview, getByOrganization, getByLocation, getMinesMap };