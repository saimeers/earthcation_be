const ExcelJS = require('exceljs');
const { LevelAttempt, User } = require('../models');
const { getSessionProgressAdmin } = require('./session.service');
const { OUTCOMES, BANDS, stageLabel, levelLabel, failReasonLabel } = require('../utils/telemetry.labels');

// Paleta del panel (morado de marca + semáforo de desempeño), en ARGB para ExcelJS.
const BRAND   = 'FF7C3AED';
const HEADER_TEXT = 'FFFFFFFF';
const TINTS = {
  good:    { fill: 'FFDCFCE7', font: 'FF166534' },
  warn:    { fill: 'FFFEF3C7', font: 'FF92400E' },
  bad:     { fill: 'FFFEE2E2', font: 'FF991B1B' },
  neutral: { fill: 'FFF1F5F9', font: 'FF475569' },
};
const BAND_TINT    = { destacado: 'good', en_progreso: 'warn', refuerzo: 'bad', sin_datos: 'neutral' };
const OUTCOME_TINT = { completed: 'good', failed: 'bad', abandoned: 'warn', in_progress: 'neutral' };

const msToDays = (ms) => (ms == null ? null : ms / 86400000); // Excel guarda tiempos como fracción de día
const secs     = (ms) => (ms == null ? null : Math.round(ms / 100) / 10);
// Excel no tiene zona horaria: se escribe la hora local de Colombia (UTC−5, sin horario de verano).
const bogota = (d) => (d ? new Date(new Date(d).getTime() - 5 * 3600000) : null);
const fullName = (u) => [u?.first_name, u?.last_name].filter(Boolean).join(' ');

const tint = (cell, kind) => {
  const t = TINTS[kind];
  if (!t) return;
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: t.fill } };
  cell.font = { ...(cell.font || {}), bold: true, color: { argb: t.font } };
};

// Hoja con encabezado de marca, fila congelada, autofiltro y anchos fijos.
const addTableSheet = (wb, name, columns, rows, { onRow } = {}) => {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns.map(c => ({ header: c.header, key: c.key, width: c.width ?? 14, style: c.numFmt ? { numFmt: c.numFmt } : {} }));
  const header = ws.getRow(1);
  header.height = 22;
  header.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    cell.font = { bold: true, color: { argb: HEADER_TEXT } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  rows.forEach(r => {
    const row = ws.addRow(r);
    row.alignment = { vertical: 'middle' };
    if (onRow) onRow(row, r);
  });
  if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
};

const buildSessionWorkbook = async (sessionId) => {
  const data = await getSessionProgressAdmin(sessionId);
  const { session, summary, participants, risks } = data;

  const attempts = await LevelAttempt.findAll({
    where: { session_id: sessionId },
    include: [{ model: User, as: 'user', attributes: ['first_name', 'last_name', 'cedula'] }],
    order: [['started_at', 'ASC']],
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Earthcation';
  wb.created = new Date();

  // ── Resumen ────────────────────────────────────────────────────────────────
  const ws = wb.addWorksheet('Resumen');
  ws.columns = [{ width: 32 }, { width: 44 }];
  ws.mergeCells('A1:B1');
  ws.getCell('A1').value = `Informe de sesión — ${session.name}`;
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: BRAND } };
  ws.getRow(1).height = 28;
  ws.getCell('A2').value = `Generado el ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`;
  ws.getCell('A2').font = { italic: true, color: { argb: 'FF64748B' } };

  const durationMin = session.started_at && session.ended_at
    ? Math.round((new Date(session.ended_at) - new Date(session.started_at)) / 60000) : null;
  const info = [
    ['Sesión', session.name],
    ['Código de sala', session.is_free_play ? 'Juego libre (sin sala)' : session.code],
    ['Estado', { waiting: 'En espera', active: 'En curso', finished: 'Finalizada' }[session.status] ?? session.status],
    ['Instructor', fullName(session.instructor) || '—'],
    ['Localidad', session.location ? `${session.location.municipality}, ${session.location.department}` : '—'],
    ['Inicio', bogota(session.started_at) ?? '—'],
    ['Fin', bogota(session.ended_at) ?? '—'],
    ['Duración (min)', durationMin ?? '—'],
    null,
    ['Participantes', summary.participants],
    ['Participantes con resultados', summary.with_data],
    ['Mitigación promedio', summary.avg_percentage != null ? summary.avg_percentage / 100 : '—'],
    ['Resultados por riesgo registrados', summary.risk_results],
    ['Intentos de nivel', summary.level_attempts],
    ['Niveles completados', summary.level_completed],
    ['Tasa de finalización de niveles', summary.completion_rate != null ? summary.completion_rate / 100 : '—'],
    ['Tiempo de reacción promedio (s)', secs(summary.avg_reaction_ms) ?? '—'],
    null,
    ...Object.entries(summary.bands).map(([k, v]) => [`Desempeño: ${BANDS[k]}`, v]),
  ];
  let r = 4;
  info.forEach(entry => {
    if (!entry) { r++; return; }
    const [label, value] = entry;
    ws.getCell(`A${r}`).value = label;
    ws.getCell(`A${r}`).font = { bold: true, color: { argb: 'FF334155' } };
    const cell = ws.getCell(`B${r}`);
    cell.value = value;
    cell.alignment = { horizontal: 'left' };
    if (value instanceof Date) cell.numFmt = 'dd/mm/yyyy hh:mm';
    if (/Mitigación promedio|Tasa de/.test(label) && typeof value === 'number') cell.numFmt = '0%';
    if (label.startsWith('Desempeño:')) {
      const key = Object.keys(BANDS).find(k => label.endsWith(BANDS[k]));
      tint(ws.getCell(`A${r}`), BAND_TINT[key]);
    }
    r++;
  });

  // ── Participantes ──────────────────────────────────────────────────────────
  addTableSheet(wb, 'Participantes', [
    { header: 'Cédula', key: 'cedula', width: 14 },
    { header: 'Nombre', key: 'nombre', width: 28 },
    { header: 'Organización', key: 'org', width: 24 },
    { header: 'Estilo VARK', key: 'vark', width: 16 },
    { header: 'Desempeño', key: 'band', width: 18 },
    { header: '% Mitigación', key: 'pct', width: 13, numFmt: '0%' },
    { header: 'Riesgos evaluados', key: 'total', width: 12 },
    { header: 'Mitigados', key: 'mitigated', width: 11 },
    { header: 'Errores', key: 'mistakes', width: 10 },
    { header: 'Reacción prom. (s)', key: 'reaction', width: 13, numFmt: '0.0' },
    { header: 'Intentos de nivel', key: 'attempts', width: 11 },
    { header: 'Completados', key: 'completed', width: 12 },
    { header: 'Fallidos', key: 'failed', width: 10 },
    { header: 'Abandonados', key: 'abandoned', width: 12 },
    { header: 'Mejor tiempo', key: 'best', width: 12, numFmt: '[m]:ss' },
    { header: 'Riesgo más débil', key: 'weakest', width: 34 },
    { header: 'Causa de fallo más común', key: 'cause', width: 26 },
  ], participants.map(p => ({
    cedula: p.user?.cedula ?? '',
    nombre: fullName(p.user),
    org: p.organization ?? '',
    vark: p.dominant_style ?? '',
    band: BANDS[p.band],
    pct: p.total_attempts ? p.percentage / 100 : null,
    total: p.total_attempts,
    mitigated: p.mitigated,
    mistakes: p.mistakes_total,
    reaction: secs(p.avg_reaction_ms),
    attempts: p.telemetry.attempts,
    completed: p.telemetry.completed,
    failed: p.telemetry.failed,
    abandoned: p.telemetry.abandoned,
    best: msToDays(p.telemetry.best_time_ms),
    weakest: p.weakest_risk ? `${p.weakest_risk.risk_id} · ${p.weakest_risk.risk_name ?? ''}` : '',
    cause: p.telemetry.top_fail_reason ? `${failReasonLabel(p.telemetry.top_fail_reason.reason)} (${p.telemetry.top_fail_reason.count})` : '',
    _band: p.band,
  })), { onRow: (row, d) => tint(row.getCell('band'), BAND_TINT[d._band]) });

  // ── Riesgos de la sesión ───────────────────────────────────────────────────
  addTableSheet(wb, 'Riesgos de la sesión', [
    { header: 'Código', key: 'id', width: 10 },
    { header: 'Riesgo', key: 'name', width: 40 },
    { header: 'Categoría', key: 'cat', width: 16 },
    { header: 'Nivel', key: 'level', width: 22 },
    { header: 'Resultados', key: 'results', width: 11 },
    { header: 'Mitigados', key: 'mitigated', width: 11 },
    { header: 'Fallidos', key: 'failed', width: 10 },
    { header: '% Fallo', key: 'rate', width: 10, numFmt: '0%' },
    { header: 'Errores', key: 'mistakes', width: 10 },
    { header: 'Reacción prom. (s)', key: 'reaction', width: 13, numFmt: '0.0' },
  ], risks.map(k => ({
    id: k.risk_id, name: k.risk_name, cat: k.category, level: k.level_name,
    results: k.results, mitigated: k.mitigated, failed: k.failed,
    rate: k.fail_rate != null ? k.fail_rate / 100 : null,
    mistakes: k.mistakes_total, reaction: secs(k.avg_reaction_ms),
  })), { onRow: (row, d) => tint(row.getCell('rate'), d.rate >= 0.5 ? 'bad' : d.rate >= 0.2 ? 'warn' : 'good') });

  // ── Resultados por riesgo (una fila por resultado) ─────────────────────────
  const results = [];
  participants.forEach(p => p.by_level.forEach(l => l.risks.forEach(k => results.push({
    cedula: p.user?.cedula ?? '', nombre: fullName(p.user), level: l.name,
    id: k.risk_id, name: k.risk_name, cat: k.category,
    result: k.is_mitigated ? 'Mitigado' : 'Fallido', _ok: k.is_mitigated,
    mistakes: k.mistakes_count ?? 0, reaction: secs(k.reaction_time_ms),
    date: bogota(k.recorded_at),
  }))));
  results.sort((a, b) => a.nombre.localeCompare(b.nombre) || (a.date - b.date));
  addTableSheet(wb, 'Resultados por riesgo', [
    { header: 'Cédula', key: 'cedula', width: 14 },
    { header: 'Nombre', key: 'nombre', width: 28 },
    { header: 'Nivel', key: 'level', width: 22 },
    { header: 'Código', key: 'id', width: 10 },
    { header: 'Riesgo', key: 'name', width: 40 },
    { header: 'Categoría', key: 'cat', width: 16 },
    { header: 'Resultado', key: 'result', width: 12 },
    { header: 'Errores', key: 'mistakes', width: 10 },
    { header: 'Reacción (s)', key: 'reaction', width: 12, numFmt: '0.0' },
    { header: 'Fecha', key: 'date', width: 18, numFmt: 'dd/mm/yyyy hh:mm' },
  ], results, { onRow: (row, d) => tint(row.getCell('result'), d._ok ? 'good' : 'bad') });

  // ── Intentos por nivel ─────────────────────────────────────────────────────
  addTableSheet(wb, 'Intentos por nivel', [
    { header: 'Cédula', key: 'cedula', width: 14 },
    { header: 'Nombre', key: 'nombre', width: 28 },
    { header: 'Nivel', key: 'level', width: 10 },
    { header: 'N.º intento', key: 'n', width: 10 },
    { header: 'Resultado', key: 'outcome', width: 13 },
    { header: 'Causa de fallo', key: 'reason', width: 24 },
    { header: 'Etapa', key: 'stage', width: 24 },
    { header: 'Duración', key: 'duration', width: 10, numFmt: '[m]:ss' },
    { header: 'Vida final', key: 'health', width: 10 },
    { header: 'Detector', key: 'brand', width: 20 },
    { header: 'Calibrado', key: 'calibrated', width: 10 },
    { header: 'Inicio', key: 'start', width: 18, numFmt: 'dd/mm/yyyy hh:mm' },
  ], attempts.map(a => ({
    cedula: a.user?.cedula ?? '', nombre: fullName(a.user), level: levelLabel(a.level_key),
    n: a.attempt_number, outcome: OUTCOMES[a.outcome] ?? a.outcome, _outcome: a.outcome,
    reason: failReasonLabel(a.fail_reason), stage: stageLabel(a.fail_stage),
    duration: msToDays(a.duration_ms), health: a.final_health != null ? Math.round(a.final_health) : null,
    brand: a.gas_brand ?? '', calibrated: a.device_calibrated == null ? '' : (a.device_calibrated ? 'Sí' : 'No'),
    start: bogota(a.started_at),
  })), { onRow: (row, d) => tint(row.getCell('outcome'), OUTCOME_TINT[d._outcome]) });

  return { workbook: wb, session };
};

module.exports = { buildSessionWorkbook };
