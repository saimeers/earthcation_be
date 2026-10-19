const { Op, fn, col, literal } = require('sequelize');
const { GameVisit, LoginEvent, GameVersion } = require('../models');
const { remember, setIfAbsent } = require('./cache.service');
const { parseUserAgent } = require('../utils/userAgent');
const { fromCloudflare } = require('../utils/clientIp');

const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);
// Cloudflare llama "Norte de Santander Department" a los departamentos de Colombia
const place = (v, max) => str(v, max)?.replace(/\s+Department$/i, '') ?? null;
// Node lee los headers como latin1 y Cloudflare manda cf-ipcity/cf-region en UTF-8 ("CÃºcuta")
const utf8Header = (v) => {
  if (typeof v !== 'string' || !/[À-ÿ]/.test(v)) return v;
  const fixed = Buffer.from(v, 'latin1').toString('utf8');
  return fixed.includes('�') ? v : fixed;
};

// Escáneres y robots: user-agent declarado, o red de un centro de datos (llegan con UA de Chrome falso
// apenas se emite el certificado de un dominio nuevo). Se guardan marcados y no cuentan en el panel.
const BOT_UA = /bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|go-http|java\/|okhttp|axios|node-fetch|scan|facebookexternalhit|whatsapp|telegram|slack|discord/i;
const DATACENTER = /amazon|aws|google|microsoft|azure|ovh|hetzner|digitalocean|linode|akamai|oracle|alibaba|tencent|contabo|vultr|choopa|leaseweb|m247|scaleway|hostinger|datacamp|cdn77|g-core|hosting|data ?center|server|cloud/i;
const isBot = (ua, asOrg) => !ua || BOT_UA.test(ua) || (asOrg ? DATACENTER.test(asOrg) : false);

/** Visita que reporta el Worker al servir el index de la versión en línea. */
const ingest = async (body) => {
  const visitor = str(body.visitor, 64);
  const asOrg = str(body.as_organization, 120);
  const bot = isBot(body.user_agent, asOrg);
  // Recargar o volver a abrir en menos de 30 min no es otra visita única
  const isUnique = bot ? false : visitor ? await setIfAbsent(`visit:${visitor}`, 1800) : true;
  const uuid = /^[0-9a-f-]{36}$/i;
  await GameVisit.create({
    visitor,
    is_unique: isUnique,
    version_id: uuid.test(body.version_id ?? '') ? body.version_id : null,
    country: str(body.country, 2),
    region: place(body.region, 80),
    city: str(body.city, 80),
    colo: str(body.colo, 8),
    latitude: num(body.latitude),
    longitude: num(body.longitude),
    session_code: /^\d{3}$/.test(body.session_code ?? '') ? body.session_code : null,
    asn: Number.isInteger(body.asn) ? body.asn : null,
    as_org: asOrg,
    is_bot: bot,
    ...parseUserAgent(body.user_agent),
  });
};

/**
 * Ubicación del inicio de sesión. Los headers cf-* solo se creen si la petición llegó por Cloudflare
 * (cf-region y cf-ipcity requieren la transformación "Add visitor location headers" en la zona).
 * No bloquea el login: si falla, solo se registra en consola.
 */
const recordLogin = (req, user) => {
  const fromCf = fromCloudflare(req);
  const h = (name, max) => (fromCf ? str(utf8Header(req.headers[name]), max) : null);
  const country = h('cf-ipcountry', 2);
  LoginEvent.create({
    user_id: user.id,
    role: user.role,
    country: country === 'XX' || country === 'T1' ? null : country,
    region: fromCf ? place(utf8Header(req.headers['cf-region']), 80) : null,
    city: h('cf-ipcity', 80),
    ...parseUserAgent(req.headers['user-agent']),
  }).catch(err => console.error('[login-event]', err.message));
};

// ── Estadísticas para el panel (Visitas) ────────────────────────────────────

const countBy = async (Model, where, field, limit = 12) => {
  const rows = await Model.findAll({
    where: { ...where, [field]: { [Op.ne]: null } },
    attributes: [[col(field), 'key'], [fn('COUNT', col('id')), 'count']],
    group: [field],
    order: [[literal('count'), 'DESC']],
    limit,
    raw: true,
  });
  return rows.map(r => ({ key: r.key, count: Number(r.count) }));
};

const computeStats = async (days) => {
  const since = new Date(Date.now() - days * 86400000);
  const loginWhere = { created_at: { [Op.gte]: since } };
  const where = { ...loginWhere, is_bot: false }; // visitas de personas
  const day = literal(`date_trunc('day', "created_at" AT TIME ZONE 'America/Bogota')`);

  const [
    totals, bots, perDay, countries, regions, cities, devices, os, browsers, byVersion,
    loginTotals, loginsPerDay, loginRegions, loginDevices,
  ] = await Promise.all([
    GameVisit.findOne({
      where,
      attributes: [
        [fn('COUNT', col('id')), 'visits'],
        [fn('COUNT', literal('CASE WHEN is_unique THEN 1 END')), 'unique'],
        [fn('COUNT', literal('CASE WHEN session_code IS NOT NULL THEN 1 END')), 'via_qr'],
        [fn('COUNT', fn('DISTINCT', col('visitor'))), 'visitors'],
      ],
      raw: true,
    }),
    GameVisit.count({ where: { ...loginWhere, is_bot: true } }),
    GameVisit.findAll({
      where,
      attributes: [[day, 'day'], [fn('COUNT', col('id')), 'visits'], [fn('COUNT', literal('CASE WHEN is_unique THEN 1 END')), 'unique']],
      group: [day], order: [[day, 'ASC']], raw: true,
    }),
    countBy(GameVisit, where, 'country'),
    GameVisit.findAll({
      where: { ...where, region: { [Op.ne]: null } },
      attributes: ['country', 'region', [fn('COUNT', col('id')), 'count']],
      group: ['country', 'region'], order: [[literal('count'), 'DESC']], limit: 40, raw: true,
    }),
    GameVisit.findAll({
      where: { ...where, city: { [Op.ne]: null } },
      attributes: [
        'country', 'region', 'city', [fn('COUNT', col('id')), 'count'],
        [fn('AVG', col('latitude')), 'lat'], [fn('AVG', col('longitude')), 'lng'],
      ],
      group: ['country', 'region', 'city'], order: [[literal('count'), 'DESC']], limit: 60, raw: true,
    }),
    countBy(GameVisit, where, 'device'),
    countBy(GameVisit, where, 'os'),
    countBy(GameVisit, where, 'browser'),
    countBy(GameVisit, where, 'version_id'),
    LoginEvent.findAll({
      where: loginWhere, attributes: ['role', [fn('COUNT', col('id')), 'count'], [fn('COUNT', fn('DISTINCT', col('user_id'))), 'users']],
      group: ['role'], raw: true,
    }),
    LoginEvent.findAll({
      where: loginWhere, attributes: [[day, 'day'], [fn('COUNT', col('id')), 'count']],
      group: [day], order: [[day, 'ASC']], raw: true,
    }),
    LoginEvent.findAll({
      where: { ...loginWhere, region: { [Op.ne]: null } },
      attributes: ['country', 'region', [fn('COUNT', col('id')), 'count']],
      group: ['country', 'region'], order: [[literal('count'), 'DESC']], limit: 20, raw: true,
    }),
    countBy(LoginEvent, loginWhere, 'device'),
  ]);

  const versionIds = byVersion.map(v => v.key);
  const labels = versionIds.length
    ? Object.fromEntries((await GameVersion.findAll({ where: { id: versionIds }, attributes: ['id', 'label'], raw: true })).map(v => [v.id, v.label]))
    : {};
  const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

  return {
    days,
    since,
    totals: {
      visits: Number(totals?.visits ?? 0),
      unique: Number(totals?.unique ?? 0),
      via_qr: Number(totals?.via_qr ?? 0),
      visitors: Number(totals?.visitors ?? 0),
      bots, // escáneres/robots descartados
    },
    per_day: perDay.map(r => ({ day: dayKey(r.day), visits: Number(r.visits), unique: Number(r.unique) })),
    countries,
    regions: regions.map(r => ({ country: r.country, region: r.region, count: Number(r.count) })),
    cities: cities.map(r => ({
      country: r.country, region: r.region, city: r.city, count: Number(r.count),
      lat: r.lat == null ? null : Number(r.lat), lng: r.lng == null ? null : Number(r.lng),
    })),
    devices, os, browsers,
    versions: byVersion.map(v => ({ id: v.key, label: labels[v.key] ?? 'Borrada', count: v.count })),
    logins: {
      by_role: loginTotals.map(r => ({ role: r.role, count: Number(r.count), users: Number(r.users) })),
      per_day: loginsPerDay.map(r => ({ day: dayKey(r.day), count: Number(r.count) })),
      regions: loginRegions.map(r => ({ country: r.country, region: r.region, count: Number(r.count) })),
      devices: loginDevices,
    },
  };
};

const getStats = (days) => remember('visits', `stats:${days}`, 60, () => computeStats(days));

module.exports = { ingest, recordLogin, getStats };
