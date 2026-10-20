// Prueba de carga: simula N jugadores jugando a la vez (intento + lotes de telemetría cada 2 s +
// resultados de riesgo) y paneles consultando el detalle de la sesión cada 15 s, como en una clase.
// Usa usuarios jugadores existentes con tokens firmados localmente (no hace login) y marca todo con
// level_key 'loadtest' para poder borrarlo: `node scripts/load/simulate-players.js --cleanup`.
//
//   node scripts/load/simulate-players.js [--url http://localhost:3077] [--players 50] [--seconds 60] [--panels 2]
//
// Solo contra la BD de pruebas: escribe filas reales.
require('dotenv').config();
const { Op } = require('sequelize');
const { User, Risk, LevelAttempt, GameEvent, UserRiskProgress, TrainingSession } = require('../../src/legacy/models');
const { generateToken } = require('../../src/legacy/utils/jwt.utils');

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const BASE = (args.url || 'http://localhost:3077') + '/api';
const PLAYERS = Number(args.players || 50);
const SECONDS = Number(args.seconds || 60);
const PANELS = Number(args.panels || 2);
const LEVEL_KEY = 'loadtest';

const samples = []; // { kind, ms, ok }
const call = async (kind, token, method, path, body) => {
  const t = performance.now();
  let ok = false;
  try {
    const r = await fetch(BASE + path, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    ok = r.ok;
    const json = await r.json().catch(() => null);
    samples.push({ kind, ms: performance.now() - t, ok, status: r.status });
    return json;
  } catch {
    samples.push({ kind, ms: performance.now() - t, ok: false, status: 0 });
    return null;
  }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const jitter = (ms) => ms * (0.7 + Math.random() * 0.6);

const cleanup = async () => {
  const attempts = await LevelAttempt.findAll({ where: { level_key: LEVEL_KEY }, attributes: ['id'] });
  const ids = attempts.map(a => a.id);
  const ev = ids.length ? await GameEvent.destroy({ where: { attempt_id: { [Op.in]: ids } } }) : 0;
  const pr = ids.length ? await UserRiskProgress.destroy({ where: { attempt_id: { [Op.in]: ids } } }) : 0;
  const at = await LevelAttempt.destroy({ where: { level_key: LEVEL_KEY } });
  console.log(`Borrado: ${at} intentos, ${ev} eventos, ${pr} resultados de riesgo de la prueba de carga.`);
};

const player = async (user, riskIds, deadline) => {
  const token = generateToken({ id: user.id, username: user.cedula, role: 'player' });
  await sleep(Math.random() * 3000); // no entran todos en el mismo milisegundo
  const res = await call('startAttempt', token, 'POST', '/telemetry/attempts', { level_key: LEVEL_KEY });
  const attemptId = res?.attempt?.id;
  if (!attemptId) return;
  let n = 0;
  while (Date.now() < deadline) {
    await sleep(jitter(2000));
    const events = Array.from({ length: 1 + Math.floor(Math.random() * 6) }, (_, i) => ({ event_type: 'load_test', t_ms: n * 2000 + i * 100, payload: { i } }));
    await call('events', token, 'POST', '/telemetry/events', { attempt_id: attemptId, events });
    if (++n % 8 === 0) {
      await call('progress', token, 'POST', '/progress/save', {
        risk_id: riskIds[n % riskIds.length], attempt_id: attemptId, is_mitigated: Math.random() > 0.3,
        mistakes_count: 0, reaction_time_ms: 800, detail: { load_test: true },
      });
    }
  }
  await call('endAttempt', token, 'PATCH', `/telemetry/attempts/${attemptId}`, { outcome: 'abandoned' });
};

const panel = async (admin, sessionId, deadline) => {
  const token = generateToken({ id: admin.id, username: admin.cedula, role: 'admin' });
  while (Date.now() < deadline) {
    await call('panelPoll', token, 'GET', `/sessions/${sessionId}/progress/admin`);
    await sleep(15000);
  }
};

const report = () => {
  const byKind = {};
  for (const s of samples) (byKind[s.kind] ||= []).push(s);
  const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
  const rows = Object.entries(byKind).map(([kind, arr]) => {
    const ms = arr.map(s => s.ms).sort((a, b) => a - b);
    const statuses = [...new Set(arr.filter(s => !s.ok).map(s => s.status))];
    return { kind, requests: arr.length, errors: arr.filter(s => !s.ok).length, p50_ms: Math.round(pct(ms, 0.5)), p95_ms: Math.round(pct(ms, 0.95)), max_ms: Math.round(ms[ms.length - 1]), error_status: statuses.join(',') };
  });
  const all = samples.map(s => s.ms).sort((a, b) => a - b);
  console.table(rows);
  console.log(`Total: ${samples.length} peticiones en ${SECONDS}s (${(samples.length / SECONDS).toFixed(1)}/s), errores ${samples.filter(s => !s.ok).length}, p50 ${Math.round(pct(all, 0.5))} ms, p95 ${Math.round(pct(all, 0.95))} ms`);
};

(async () => {
  if (args.cleanup) { await cleanup(); process.exit(0); }
  const users = await User.findAll({ where: { role: 'player', is_active: true }, limit: PLAYERS, attributes: ['id', 'cedula'] });
  const admin = await User.findOne({ where: { role: 'admin' }, attributes: ['id', 'cedula'] });
  const riskIds = (await Risk.findAll({ attributes: ['id'], limit: 6 })).map(r => r.id);
  const session = await TrainingSession.findOne({ where: { is_free_play: true } });
  if (users.length < PLAYERS) console.log(`Aviso: solo hay ${users.length} jugadores; cada uno juega varias veces.`);
  const pool = Array.from({ length: PLAYERS }, (_, i) => users[i % users.length]);
  console.log(`${PLAYERS} jugadores + ${PANELS} paneles durante ${SECONDS}s contra ${BASE} ...`);
  const deadline = Date.now() + SECONDS * 1000;
  await Promise.all([
    ...pool.map(u => player(u, riskIds, deadline)),
    ...(session && admin ? Array.from({ length: PANELS }, () => panel(admin, session.id, deadline)) : []),
  ]);
  report();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
