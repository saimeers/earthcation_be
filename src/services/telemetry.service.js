const { LevelAttempt, GameEvent, UserRiskProgress, Risk, Level, User } = require('../models');
const { Op, fn, col, literal } = require('sequelize');

const notFound = (msg) => Object.assign(new Error(msg), { status: 404 });

// 'level2' -> fila Level cuyo nombre empieza por "Nivel 2" (el id interno puede no coincidir).
const resolveLevelId = async (levelKey) => {
  const n = String(levelKey || '').replace(/\D/g, '');
  if (!n) return null;
  const level = await Level.findOne({ where: { name: { [Op.iLike]: `Nivel ${n}%` } } });
  return level ? level.id : null;
};

// ─── Escritura (la usa el juego) ─────────────────────────────────────────────────

const startAttempt = async (userId, { level_key, session_id, vark_style, gas_brand }) => {
  // Un intento anterior que quedó abierto (cerró el juego, recargó) se marca como abandonado.
  await LevelAttempt.update(
    { outcome: 'abandoned', ended_at: new Date() },
    { where: { user_id: userId, level_key, outcome: 'in_progress' } }
  );

  const previous = await LevelAttempt.count({ where: { user_id: userId, level_key } });
  return LevelAttempt.create({
    user_id: userId,
    level_key,
    level_id: await resolveLevelId(level_key),
    session_id: session_id || null,
    attempt_number: previous + 1,
    vark_style: vark_style || null,
    gas_brand: gas_brand || null,
  });
};

const endAttempt = async (userId, attemptId, data) => {
  const attempt = await LevelAttempt.findOne({ where: { id: attemptId, user_id: userId } });
  if (!attempt) throw notFound('Intento no encontrado');

  const allowed = ['outcome', 'fail_reason', 'fail_risk_id', 'fail_stage', 'duration_ms',
    'final_health', 'device_calibrated', 'gas_brand', 'summary'];
  const patch = {};
  for (const k of allowed) if (data[k] !== undefined) patch[k] = data[k];
  if (patch.outcome && patch.outcome !== 'in_progress') patch.ended_at = new Date();

  return attempt.update(patch);
};

const saveEvents = async (userId, attemptId, events) => {
  const attempt = await LevelAttempt.findOne({ where: { id: attemptId, user_id: userId } });
  if (!attempt) throw notFound('Intento no encontrado');

  const rows = events.map(e => ({
    attempt_id: attemptId,
    user_id: userId,
    event_type: e.event_type,
    risk_id: e.risk_id || null,
    stage: e.stage || null,
    t_ms: e.t_ms ?? null,
    pos_x: e.pos_x ?? null,
    health: e.health ?? null,
    fatigue: e.fatigue ?? null,
    payload: e.payload ?? null,
  }));
  await GameEvent.bulkCreate(rows);
  return rows.length;
};

// ─── Lectura (panel web) ─────────────────────────────────────────────────────────

const listAttempts = async (userId, { level_key, session_id } = {}) => {
  const where = { user_id: userId };
  if (level_key) where.level_key = level_key;
  if (session_id) where.session_id = session_id;
  return LevelAttempt.findAll({
    where,
    include: [{ model: Level, as: 'level' }],
    order: [['started_at', 'DESC']],
  });
};

const getAttemptDetail = async (attemptId) => {
  const attempt = await LevelAttempt.findByPk(attemptId, {
    include: [
      { model: Level, as: 'level' },
      { model: User, as: 'user', attributes: ['id', 'username', 'cedula'] },
      { model: UserRiskProgress, as: 'riskResults', include: [{ model: Risk, as: 'risk' }] },
    ],
  });
  if (!attempt) throw notFound('Intento no encontrado');

  const events = await GameEvent.findAll({
    where: { attempt_id: attemptId },
    order: [['t_ms', 'ASC'], ['id', 'ASC']],
  });
  return { attempt, events };
};

const round = (v, d = 1) => (v == null ? null : Math.round(Number(v) * 10 ** d) / 10 ** d);

// Resumen de trazabilidad de un jugador: por nivel, por riesgo y dónde se equivoca.
const getUserSummary = async (userId) => {
  const attempts = await LevelAttempt.findAll({ where: { user_id: userId }, order: [['started_at', 'ASC']] });
  const riskRows = await UserRiskProgress.findAll({
    where: { user_id: userId },
    include: [{ model: Risk, as: 'risk', include: [{ model: Level, as: 'level' }] }],
    order: [['recorded_at', 'ASC']],
  });

  const levels = {};
  for (const a of attempts) {
    const l = levels[a.level_key] ||= {
      level_key: a.level_key, attempts: 0, completed: 0, failed: 0, abandoned: 0,
      retries: 0, attempts_until_first_completion: null, best_time_ms: null,
      total_time_ms: 0, fail_reasons: {}, fail_stages: {},
    };
    l.attempts++;
    l.retries = l.attempts - 1;
    if (a.duration_ms) l.total_time_ms += a.duration_ms;
    if (a.outcome === 'completed') {
      l.completed++;
      if (l.attempts_until_first_completion == null) l.attempts_until_first_completion = l.attempts;
      if (a.duration_ms && (l.best_time_ms == null || a.duration_ms < l.best_time_ms)) l.best_time_ms = a.duration_ms;
    } else if (a.outcome === 'failed') {
      l.failed++;
      const reason = a.fail_reason || 'desconocido';
      l.fail_reasons[reason] = (l.fail_reasons[reason] || 0) + 1;
      if (a.fail_stage) l.fail_stages[a.fail_stage] = (l.fail_stages[a.fail_stage] || 0) + 1;
    } else if (a.outcome === 'abandoned') l.abandoned++;
  }

  const risks = {};
  for (const r of riskRows) {
    const k = risks[r.risk_id] ||= {
      risk_id: r.risk_id, risk_name: r.risk?.name ?? null, category: r.risk?.category ?? null,
      level_name: r.risk?.level?.name ?? null,
      results: 0, mitigated: 0, failed: 0, mistakes_total: 0,
      reaction_sum: 0, reaction_n: 0, last_result: null, last_recorded_at: null,
    };
    k.results++;
    if (r.is_mitigated) k.mitigated++; else k.failed++;
    k.mistakes_total += r.mistakes_count || 0;
    if (r.reaction_time_ms != null) { k.reaction_sum += r.reaction_time_ms; k.reaction_n++; }
    k.last_result = r.is_mitigated ? 'mitigated' : 'failed';
    k.last_recorded_at = r.recorded_at;
  }
  const riskList = Object.values(risks).map(k => ({
    risk_id: k.risk_id, risk_name: k.risk_name, category: k.category, level_name: k.level_name,
    results: k.results, mitigated: k.mitigated, failed: k.failed,
    mitigation_rate: k.results ? round((k.mitigated / k.results) * 100) : null,
    mistakes_total: k.mistakes_total,
    avg_reaction_ms: k.reaction_n ? round(k.reaction_sum / k.reaction_n, 0) : null,
    last_result: k.last_result, last_recorded_at: k.last_recorded_at,
  })).sort((a, b) => b.failed - a.failed);

  const eventCounts = await GameEvent.findAll({
    where: { user_id: userId },
    attributes: ['event_type', [fn('COUNT', col('id')), 'count']],
    group: ['event_type'],
    raw: true,
  });

  return {
    user_id: userId,
    total_attempts: attempts.length,
    levels: Object.values(levels),
    risks: riskList,
    weakest_risk: riskList.find(r => r.failed > 0) || null,
    event_counts: Object.fromEntries(eventCounts.map(e => [e.event_type, Number(e.count)])),
  };
};

// Vista global para el panel: qué niveles cuestan más, de qué mueren, qué riesgo falla más.
const getOverview = async ({ session_id } = {}) => {
  const where = session_id ? { session_id } : {};

  const byLevel = await LevelAttempt.findAll({
    where,
    attributes: [
      'level_key', 'outcome',
      [fn('COUNT', col('id')), 'count'],
      [fn('AVG', col('duration_ms')), 'avg_duration_ms'],
      [fn('COUNT', fn('DISTINCT', col('user_id'))), 'players'],
    ],
    group: ['level_key', 'outcome'],
    raw: true,
  });

  const failReasons = await LevelAttempt.findAll({
    where: { ...where, outcome: 'failed' },
    attributes: ['level_key', 'fail_reason', 'fail_risk_id', 'fail_stage', [fn('COUNT', col('id')), 'count']],
    group: ['level_key', 'fail_reason', 'fail_risk_id', 'fail_stage'],
    order: [[literal('count'), 'DESC']],
    raw: true,
  });

  const retries = await LevelAttempt.findAll({
    where,
    attributes: ['level_key', [fn('AVG', col('attempt_number')), 'avg_attempt_number'], [fn('MAX', col('attempt_number')), 'max_attempt_number']],
    group: ['level_key'],
    raw: true,
  });

  const brands = await LevelAttempt.findAll({
    where: { ...where, gas_brand: { [Op.ne]: null } },
    attributes: ['gas_brand', [fn('COUNT', col('id')), 'count'],
      [fn('SUM', literal('CASE WHEN device_calibrated THEN 1 ELSE 0 END')), 'calibrated']],
    group: ['gas_brand'],
    raw: true,
  });

  const risks = await UserRiskProgress.findAll({
    where,
    attributes: [
      'risk_id',
      [fn('COUNT', col('UserRiskProgress.id')), 'results'],
      [fn('SUM', literal('CASE WHEN is_mitigated THEN 1 ELSE 0 END')), 'mitigated'],
      [fn('SUM', col('mistakes_count')), 'mistakes_total'],
      [fn('AVG', col('reaction_time_ms')), 'avg_reaction_ms'],
    ],
    include: [{ model: Risk, as: 'risk', attributes: ['name', 'category'] }],
    group: ['risk_id', 'risk.id'],
    raw: true,
    nest: true,
  });

  const eventCounts = await GameEvent.findAll({
    attributes: ['event_type', [fn('COUNT', col('GameEvent.id')), 'count']],
    include: session_id ? [{ model: LevelAttempt, as: 'attempt', attributes: [], where: { session_id } }] : [],
    group: ['event_type'],
    order: [[literal('count'), 'DESC']],
    raw: true,
  });

  return {
    levels: byLevel.map(r => ({ ...r, count: Number(r.count), players: Number(r.players), avg_duration_ms: round(r.avg_duration_ms, 0) })),
    fail_reasons: failReasons.map(r => ({ ...r, count: Number(r.count) })),
    retries: retries.map(r => ({ level_key: r.level_key, avg_attempt_number: round(r.avg_attempt_number, 2), max_attempt_number: Number(r.max_attempt_number) })),
    gas_brands: brands.map(r => ({ gas_brand: r.gas_brand, attempts: Number(r.count), calibrated: Number(r.calibrated || 0) })),
    risks: risks.map(r => {
      const results = Number(r.results), mitigated = Number(r.mitigated || 0);
      return {
        risk_id: r.risk_id, risk_name: r.risk?.name ?? null, category: r.risk?.category ?? null,
        results, mitigated, failed: results - mitigated,
        fail_rate: results ? round(((results - mitigated) / results) * 100) : null,
        mistakes_total: Number(r.mistakes_total || 0),
        avg_reaction_ms: round(r.avg_reaction_ms, 0),
      };
    }).sort((a, b) => (b.fail_rate ?? 0) - (a.fail_rate ?? 0)),
    event_counts: eventCounts.map(e => ({ event_type: e.event_type, count: Number(e.count) })),
  };
};

module.exports = { startAttempt, endAttempt, saveEvents, listAttempts, getAttemptDetail, getUserSummary, getOverview };
