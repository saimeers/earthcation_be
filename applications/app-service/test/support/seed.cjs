require('./env.cjs');
const request = require('supertest');
const { app, sequelize, models, security } = require('../../dist/container');
const { prepareDatabase } = require('../../dist/boot');
const { User, UserProfile, Level, Risk } = models;
const hashPassword = (password) => security.passwords.hash(password);
const { tokenFor } = require('./auth.cjs');

// Semilla fija para los contratos: misma forma en cada corrida. Lo que el juego y el panel escriben
// pasa por la API (como en producción); lo que en producción se creó a mano va directo a los modelos.
// Contraseña de staff generada en cada corrida (no queda escrita en el repo)
const STAFF_PASSWORD = require('crypto').randomBytes(12).toString('base64url');

const resetSchema = async () => {
  await sequelize.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const log = console.log;
  console.log = () => {};
  try { await prepareDatabase(); } finally { console.log = log; }
};

const createCatalog = async () => {
  await Level.bulkCreate([
    { id: 1, name: 'Nivel 1 - Operación Segura' },
    { id: 2, name: 'Nivel 2 - Inspección Profunda' },
  ]);
  await Risk.bulkCreate([
    { id: 'CR-01', name: 'Vibración', category: 'Biomecánico', level_id: 1 },
    { id: 'CR-03', name: 'Mecánicos', category: 'Mecánico', level_id: 1 },
    { id: 'CR-04', name: 'Derrumbe', category: 'Geotécnico', level_id: 1 },
    { id: 'CR-06', name: 'Atmósferas Tóxicas', category: 'Químico', level_id: 2 },
    { id: 'CR-07', name: 'Ofidios', category: 'Biológico', level_id: 2 },
  ]);
};

const createStaff = async (role, cedula) => {
  const user = await User.create({
    username: cedula, cedula, role, first_name: role, last_name: 'Semilla',
    email: `${role}@earthcation.test`, password_hash: await hashPassword(STAFF_PASSWORD),
  });
  await UserProfile.create({ user_id: user.id });
  return { id: user.id, cedula, role };
};

const api = (who) => ({
  get: (url) => request(app).get(url).set('Authorization', `Bearer ${tokenFor(who)}`),
  post: (url, body) => request(app).post(url).set('Authorization', `Bearer ${tokenFor(who)}`).send(body),
  patch: (url, body) => request(app).patch(url).set('Authorization', `Bearer ${tokenFor(who)}`).send(body),
});

const ok = (res, label) => {
  if (res.status >= 400) throw new Error(`Semilla: ${label} respondió ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
};

const createPeople = async (admin, location) => {
  const org = ok(await api(admin).post('/api/organizations', { name: 'Mina La Prueba', type: 'Mina' }), 'organización').data;
  const user = async (cedula, role, extra = {}) => ({
    id: ok(await api(admin).post('/api/users', {
      cedula, role, first_name: `${role}-${cedula}`, last_name: 'Semilla', age: 30,
      organization_id: org.id, location_id: location.id, ...extra,
    }), `usuario ${cedula}`).user_id,
    cedula, role,
  });
  const instructor = await user('20000001', 'instructor', { email: 'instructor@earthcation.test' });
  const players = [await user('30000001', 'player'), await user('30000002', 'player'), await user('30000003', 'player')];
  return { org, instructor, players };
};

const playLevel = async (player, sessionId, { levelKey, outcome, mitigated }) => {
  const { attempt } = ok(await api(player).post('/api/telemetry/attempts', {
    level_key: levelKey, session_id: sessionId, vark_style: 'Visual', gas_brand: 'ibrid', game_version: '2.1.2',
  }), 'intento');
  ok(await api(player).post('/api/telemetry/events', { attempt_id: attempt.id, events: [
    { event_type: 'level_started', t_ms: 0, pos_x: 0, health: 100, fatigue: 0 },
    { event_type: 'risk_panel_shown', risk_id: 'CR-04', stage: 'Sostenimiento', t_ms: 5000, payload: { read_ms: 3200 } },
  ] }), 'eventos');
  for (const [riskId, isMitigated] of mitigated) {
    ok(await api(player).post('/api/progress/save', {
      risk_id: riskId, session_id: sessionId, attempt_id: attempt.id, is_mitigated: isMitigated,
      mistakes_count: isMitigated ? 0 : 2, reaction_time_ms: 1500,
    }), `progreso ${riskId}`);
  }
  const end = outcome === 'failed'
    ? { outcome, fail_reason: 'derrumbe', fail_risk_id: 'CR-04', fail_stage: 'Sostenimiento' }
    : { outcome };
  ok(await api(player).patch(`/api/telemetry/attempts/${attempt.id}`, {
    ...end, duration_ms: 90000, final_health: outcome === 'failed' ? 0 : 80, device_calibrated: true,
    summary: { lantern_switched_on: 1, device_powered_on: 1 },
  }), 'fin de intento');
  return attempt.id;
};

const createSession = async (instructor, location, players) => {
  const created = ok(await api(instructor).post('/api/sessions', { name: 'Sala de prueba', location_id: location.id }), 'sesión');
  const session = created.session || created;
  ok(await api(instructor).patch(`/api/sessions/${session.id}/start`), 'inicio de sesión');
  for (const p of players) ok(await api(p).post('/api/sessions/join', { code: session.code }), 'unirse');
  return session;
};

const seed = async () => {
  await resetSchema();
  await createCatalog();
  const admin = await createStaff('admin', '10000001');
  const developer = await createStaff('developer', '10000002');
  const [location] = ok(await api(admin).get('/api/locations/search?municipality=Cúcuta'), 'localidad');
  const { org, instructor, players } = await createPeople(admin, location);
  const answers = { q1: 'B', q2: 'C', q3: 'A', q4: 'B' };
  for (const p of players) ok(await api(p).post('/api/vark/submit', { answers }), 'VARK');
  const session = await createSession(instructor, location, players.slice(0, 2));
  const attempts = [
    await playLevel(players[0], session.id, { levelKey: 'level1', outcome: 'failed', mitigated: [['CR-01', true], ['CR-04', false]] }),
    await playLevel(players[0], session.id, { levelKey: 'level1', outcome: 'completed', mitigated: [['CR-01', true], ['CR-03', true], ['CR-04', true]] }),
    await playLevel(players[1], session.id, { levelKey: 'level2', outcome: 'completed', mitigated: [['CR-06', true], ['CR-07', false]] }),
  ];
  // Juego libre: sin session_id la API usa la sesión "Juego libre" de la localidad del jugador
  const freeAttempt = await playLevel(players[2], null, { levelKey: 'level1', outcome: 'abandoned', mitigated: [['CR-01', false]] });
  return { admin, developer, instructor, players, org, location, session, attempts, freeAttempt, staffPassword: STAFF_PASSWORD };
};

module.exports = { seed };
