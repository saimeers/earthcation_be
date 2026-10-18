const { Op } = require('sequelize');
const { fn, col, literal } = require('sequelize');
const { TrainingSession, SessionUser, User, UserProfile, UserRiskProgress, Risk, Level, Location, LevelAttempt, GameEvent } = require('../models');
const { summarizeAttempts, summarizeRisks, round } = require('./telemetry.service');
const { summarize, latestAttemptByLevel } = require('../utils/attempt.utils');
const { generateSessionCode } = require('../utils/session.utils');
const { remember, bump } = require('./cache.service');

const createSession = async (instructorId, { name, location_id }) => {
  let code, exists;
  do {
    code  = generateSessionCode();
    // Solo choca contra sesiones que siguen "vivas" — una sesión finalizada libera su código,
    // necesario con solo 3 dígitos (1000 combinaciones) para no agotar el espacio con historial.
    exists = await TrainingSession.findOne({ where: { code, status: { [Op.ne]: 'finished' } } });
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
  const session = await TrainingSession.findOne({ where: { code, is_free_play: false } });
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

const freePlayLocked = () => Object.assign(new Error('La sesión de juego libre siempre está activa'), { status: 400 });

// Ubicación del perfil de un usuario (los instructores ven la sesión "Juego libre" de la suya)
const profileLocationId = async (userId) => {
  const profile = await UserProfile.findOne({ where: { user_id: userId }, attributes: ['location_id'] });
  return profile?.location_id || null;
};

// Dueño de la sala, o instructor de la misma ubicación si es la sesión "Juego libre"
const canSeeSession = async (session, instructorId) => {
  if (!session) return false;
  if (session.instructor_id === instructorId) return true;
  if (!session.is_free_play) return false;
  return session.location_id === await profileLocationId(instructorId);
};

const startSession = async (sessionId, instructorId) => {
  const session = await TrainingSession.findByPk(sessionId);
  if (session?.is_free_play) throw freePlayLocked();
  if (!session || session.instructor_id !== instructorId) {
    const error = new Error('Sesión no encontrada o sin permiso');
    error.status = 403;
    throw error;
  }
  await bump(`session:${sessionId}`);
  return session.update({ status: 'active', started_at: new Date() });
};

const endSession = async (sessionId, instructorId) => {
  const session = await TrainingSession.findByPk(sessionId);
  if (session?.is_free_play) throw freePlayLocked();
  if (!session || session.instructor_id !== instructorId) {
    const error = new Error('Sesión no encontrada o sin permiso');
    error.status = 403;
    throw error;
  }
  await bump(`session:${sessionId}`);
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

  if (!(await canSeeSession(session, instructorId))) {
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

      // % del último intento de cada nivel dentro de la sesión (reintentar reemplaza, no promedia)
      const latest     = latestAttemptByLevel(progress);
      const latestRows = latest.flatMap(l => l.rows);
      const { total, mitigated } = summarize(latestRows);
      const avgTime   = total > 0
        ? latestRows.reduce((acc, p) => acc + (p.reaction_time_ms || 0), 0) / total
        : null;

      return {
        user:           su.user,
        dominant_style: su.user?.varkProfile?.dominant_style || null,
        total_attempts: total,
        mitigated,
        percentage:     total > 0 ? Math.round((mitigated / total) * 100) : 0,
        level_attempts: latest.reduce((a, l) => a + l.attempts_count, 0),
        avg_reaction_ms: avgTime ? Math.round(avgTime) : null,
        progress
      };
    })
  );

  return { session, participants };
};

const getMySessions = async (instructorId) => {
  // Sus salas + la sesión "Juego libre" de su ubicación
  const locationId = await profileLocationId(instructorId);
  const where = locationId
    ? { [Op.or]: [{ instructor_id: instructorId }, { is_free_play: true, location_id: locationId }] }
    : { instructor_id: instructorId };
  return TrainingSession.findAll({
    where,
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

// Banda de desempeño por % de mitigación — misma escala que el panel web y el Excel exportado.
const performanceBand = (percentage, hasData) => {
  if (!hasData) return 'sin_datos';
  if (percentage >= 80) return 'destacado';
  if (percentage >= 40) return 'en_progreso';
  return 'refuerzo';
};

const avg = (values) => {
  const v = values.filter(x => x != null && !Number.isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

// Detalle de sesión para el panel admin: todo en 3 consultas (sesión+participantes, resultados
// por riesgo de la sesión, intentos de nivel de la sesión) agrupadas en memoria por usuario —
// antes era una consulta por participante.
// Lo consultan el detalle (cada 15 s por pestaña mientras la sesión está activa), el análisis por
// participante y el Excel: se calcula una vez cada 10 s por sesión y se comparte.
const getSessionProgressAdmin = (sessionId) =>
  remember(`session:${sessionId}`, "progress-admin", 10, () => computeSessionProgressAdmin(sessionId))

const computeSessionProgressAdmin = async (sessionId) => {
  const session = await TrainingSession.findByPk(sessionId, {
    include: [
      { model: User, as: 'instructor', attributes: ['id', 'first_name', 'last_name', 'email'] },
      { model: Location, as: 'location', attributes: ['id', 'municipality', 'department'] },
      {
        model: SessionUser, as: 'participants',
        include: [{
          model: User, as: 'user',
          attributes: ['id', 'first_name', 'last_name', 'username', 'cedula'],
          include: [
            { association: 'varkProfile', attributes: ['dominant_style'] },
            { association: 'profile', attributes: ['organization_id'], include: [{ association: 'organization', attributes: ['id', 'name'] }] },
          ]
        }]
      }
    ],
    order: [[{ model: SessionUser, as: 'participants' }, 'joined_at', 'ASC']],
  })

  if (!session) {
    const error = new Error('Sesión no encontrada')
    error.status = 404
    throw error
  }

  const progressRows = await UserRiskProgress.findAll({
    where: { session_id: sessionId },
    include: [{ model: Risk, as: 'risk', include: [{ model: Level, as: 'level' }] }],
    order: [['recorded_at', 'ASC']],
  })
  const attemptRows = await LevelAttempt.findAll({
    where: { session_id: sessionId },
    attributes: { exclude: ['summary'] },
    order: [['started_at', 'ASC']],
  })

  const groupBy = (rows) => rows.reduce((acc, r) => ((acc[r.user_id] ||= []).push(r), acc), {})
  const progressByUser = groupBy(progressRows)
  const attemptsByUser = groupBy(attemptRows)

  const participants = session.participants.map((su) => {
    const progress  = progressByUser[su.user_id] ?? []
    const attempts  = attemptsByUser[su.user_id] ?? []
    // % del último intento de cada nivel (reintentar reemplaza, no promedia); el detalle de
    // riesgos y la telemetría siguen mostrando todo el historial de la sesión
    const latest     = latestAttemptByLevel(progress)
    const latestRows = latest.flatMap(l => l.rows)
    const { total, mitigated, percentage } = summarize(latestRows)
    const avgTime   = avg(latestRows.map(p => p.reaction_time_ms))

    // Agrupa por nivel (se mantiene por compatibilidad)
    const byLevel = {}
    latest.forEach(l => {
      byLevel[l.level_id ?? 'unknown'] = { name: l.rows[0]?.risk?.level?.name ?? 'Sin nivel', total: l.total, mitigated: l.mitigated, attempts: l.attempts_count, risks: [] }
    })
    latestRows.forEach(p => {
      const levelId   = p.risk?.level?.id   ?? 'unknown'
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

    const risks  = summarizeRisks(progress)
    const levels = summarizeAttempts(attempts)
    const failReasons = {}
    attempts.filter(a => a.outcome === 'failed').forEach(a => {
      const k = a.fail_reason || 'desconocido'
      failReasons[k] = (failReasons[k] || 0) + 1
    })
    const topFail = Object.entries(failReasons).sort((a, b) => b[1] - a[1])[0]

    return {
      user:            su.user,
      organization:    su.user?.profile?.organization?.name ?? null,
      joined_at:       su.joined_at,
      dominant_style:  su.user?.varkProfile?.dominant_style || null,
      total_attempts:  total,
      mitigated,
      percentage,
      level_attempts:  latest.reduce((a, l) => a + l.attempts_count, 0),
      mistakes_total:  latestRows.reduce((a, p) => a + (p.mistakes_count || 0), 0), // mismo universo que total_attempts
      avg_reaction_ms: avgTime != null ? Math.round(avgTime) : null,
      band:            performanceBand(percentage, total > 0),
      by_level:        Object.values(byLevel),
      risks,
      weakest_risk:    risks.find(r => r.failed > 0) || null,
      telemetry: {
        attempts:  attempts.length,
        completed: attempts.filter(a => a.outcome === 'completed').length,
        failed:    attempts.filter(a => a.outcome === 'failed').length,
        abandoned: attempts.filter(a => a.outcome === 'abandoned').length,
        best_time_ms:  levels.reduce((m, l) => (l.best_time_ms != null && (m == null || l.best_time_ms < m) ? l.best_time_ms : m), null),
        total_time_ms: levels.reduce((a, l) => a + l.total_time_ms, 0),
        top_fail_reason: topFail ? { reason: topFail[0], count: topFail[1] } : null,
        levels,
        // Recorrido intento a intento por nivel, para los puntos ✓/✗/↩ de la tabla
        journeys: attempts.reduce((acc, a) => {
          (acc[a.level_key] ||= []).push({
            id: a.id, attempt_number: a.attempt_number, outcome: a.outcome,
            fail_reason: a.fail_reason, fail_stage: a.fail_stage, duration_ms: a.duration_ms,
          })
          return acc
        }, {}),
      },
    }
  })

  // Riesgos de la sesión completa, ordenados por tasa de fallo
  const risks = summarizeRisks(progressRows)
    .map(r => ({ ...r, fail_rate: r.results ? round((r.failed / r.results) * 100) : null }))
    .sort((a, b) => (b.fail_rate ?? 0) - (a.fail_rate ?? 0))

  const withData = participants.filter(p => p.total_attempts > 0)
  const bands = { destacado: 0, en_progreso: 0, refuerzo: 0, sin_datos: 0 }
  participants.forEach(p => { bands[p.band]++ })

  const failReasons = {}
  attemptRows.filter(a => a.outcome === 'failed').forEach(a => {
    const key = `${a.level_key}|${a.fail_reason || 'desconocido'}|${a.fail_stage || ''}`
    failReasons[key] = (failReasons[key] || 0) + 1
  })

  const levelAttempts  = attemptRows.length
  const levelCompleted = attemptRows.filter(a => a.outcome === 'completed').length
  const avgPct = avg(withData.map(p => p.percentage))
  const avgReaction = avg(participants.map(p => p.avg_reaction_ms))

  return {
    session,
    summary: {
      participants:     participants.length,
      with_data:        withData.length,
      avg_percentage:   avgPct != null ? Math.round(avgPct) : null,
      avg_reaction_ms:  avgReaction != null ? Math.round(avgReaction) : null,
      risk_results:     progressRows.length,
      risk_mitigated:   progressRows.filter(p => p.is_mitigated).length,
      level_attempts:   levelAttempts,
      level_completed:  levelCompleted,
      level_failed:     attemptRows.filter(a => a.outcome === 'failed').length,
      completion_rate:  levelAttempts ? Math.round((levelCompleted / levelAttempts) * 100) : null,
      bands,
    },
    risks,
    levels: summarizeAttempts(attemptRows),
    fail_reasons: Object.entries(failReasons)
      .map(([key, count]) => {
        const [level_key, fail_reason, fail_stage] = key.split('|')
        return { level_key, fail_reason, fail_stage: fail_stage || null, count }
      })
      .sort((a, b) => b.count - a.count),
    participants,
  }
}

const sumSummaryCounters = (attempts) => {
  const totals = {}
  attempts.forEach(a => {
    Object.entries(a.summary || {}).forEach(([k, v]) => {
      if (typeof v === 'number') totals[k] = (totals[k] || 0) + v
    })
  })
  return totals
}

// Análisis completo de un participante dentro de una sesión: lo suyo + promedios del grupo para
// comparar, más sus intentos (sin eventos — la línea de tiempo se pide aparte por intento).
const getParticipantAnalysis = async (sessionId, userId) => {
  const data = await getSessionProgressAdmin(sessionId)
  const idx  = data.participants.findIndex(p => p.user?.id === userId)
  if (idx === -1) {
    const error = new Error('El usuario no participa en esta sesión')
    error.status = 404
    throw error
  }
  const participant = data.participants[idx]

  const user = await User.findByPk(userId, {
    attributes: ['id', 'first_name', 'last_name', 'username', 'cedula', 'email', 'age'],
    include: [
      { association: 'varkProfile', attributes: ['dominant_style', 'visual_score', 'auditory_score', 'reading_score'] },
      { association: 'profile', include: [{ association: 'organization' }, { association: 'location' }] },
    ],
  })

  const attempts = await LevelAttempt.findAll({
    where: { session_id: sessionId, user_id: userId },
    include: [{ model: Level, as: 'level' }],
    order: [['started_at', 'ASC']],
  })

  const eventCounts = await GameEvent.findAll({
    attributes: ['event_type', [fn('COUNT', col('GameEvent.id')), 'count']],
    where: { user_id: userId },
    include: [{ model: LevelAttempt, as: 'attempt', attributes: [], where: { session_id: sessionId } }],
    group: ['event_type'],
    raw: true,
  })

  // Tiempo leyendo paneles informativos: suyo y del grupo
  const readTimes = await GameEvent.findAll({
    attributes: ['user_id', [fn('AVG', literal("(payload->>'read_ms')::float")), 'avg_read_ms'], [fn('COUNT', col('GameEvent.id')), 'panels']],
    where: { event_type: 'risk_info_closed' },
    include: [{ model: LevelAttempt, as: 'attempt', attributes: [], where: { session_id: sessionId } }],
    group: ['GameEvent.user_id'],
    raw: true,
  })
  const myRead = readTimes.find(r => r.user_id === userId)

  // Promedios del grupo (solo participantes con datos)
  const others = data.participants.filter(p => p.total_attempts > 0 || p.telemetry.attempts > 0)
  const levelGroup = {}
  others.forEach(p => p.telemetry.levels.forEach(l => {
    const g = levelGroup[l.level_key] ||= { firsts: [], bests: [] }
    if (l.attempts_until_first_completion != null) g.firsts.push(l.attempts_until_first_completion)
    if (l.best_time_ms != null) g.bests.push(l.best_time_ms)
  }))
  const roundOr = (v, d = 0) => (v == null ? null : round(v, d))

  return {
    session: {
      id: data.session.id, name: data.session.name, code: data.session.code, is_free_play: data.session.is_free_play,
      status: data.session.status, started_at: data.session.started_at, ended_at: data.session.ended_at,
    },
    user,
    participant,
    attempts,
    summary_counters: sumSummaryCounters(attempts),
    event_counts: Object.fromEntries(eventCounts.map(e => [e.event_type, Number(e.count)])),
    reading: {
      panels:      myRead ? Number(myRead.panels) : 0,
      avg_read_ms: myRead ? roundOr(Number(myRead.avg_read_ms)) : null,
      group_avg_read_ms: roundOr(avg(readTimes.map(r => Number(r.avg_read_ms)))),
    },
    group: {
      participants:        data.summary.participants,
      avg_percentage:      data.summary.avg_percentage,
      avg_reaction_ms:     data.summary.avg_reaction_ms,
      avg_mistakes_per_result: roundOr(avg(others.filter(p => p.total_attempts).map(p => p.mistakes_total / p.total_attempts)), 2),
      avg_level_attempts:  roundOr(avg(others.map(p => p.telemetry.attempts)), 1),
      rank:                1 + data.participants.filter(p => p.percentage > participant.percentage).length,
      levels: Object.fromEntries(Object.entries(levelGroup).map(([k, g]) => [k, {
        avg_attempts_until_first_completion: roundOr(avg(g.firsts), 1),
        avg_best_time_ms: roundOr(avg(g.bests)),
      }])),
      risks: Object.fromEntries(data.risks.map(r => [r.risk_id, {
        mitigation_rate: r.mitigation_rate, avg_reaction_ms: r.avg_reaction_ms,
      }])),
    },
    navigation: {
      index: idx,
      total: data.participants.length,
      prev: data.participants[idx - 1]?.user?.id ?? null,
      next: data.participants[idx + 1]?.user?.id ?? null,
    },
  }
}

// Admin ve todo; el instructor, sus salas y la sesión "Juego libre" de su ubicación (403 si no)
const assertCanView = async (sessionId, user) => {
  if (user.role === 'admin') return;
  const session = await TrainingSession.findByPk(sessionId);
  if (!(await canSeeSession(session, user.id))) {
    throw Object.assign(new Error('Sesión no encontrada o sin permiso'), { status: 403 });
  }
};

module.exports = { assertCanView, getAllSessions, createSession, joinSession, startSession, endSession, getSessionProgress, getMySessions, getSessionsByLocation, getSessionProgressAdmin, getParticipantAnalysis, performanceBand };