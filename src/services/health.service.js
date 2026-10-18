const sequelize = require('../config/database');
const { getRedis } = require('../config/redis');
const { snapshot } = require('../middleware/metrics.middleware');
const pkg = require('../../package.json');

const timed = async (fn) => {
  const t = Date.now();
  try { await fn(); return { ok: true, ms: Date.now() - t }; }
  catch (err) { return { ok: false, ms: Date.now() - t, error: err.message }; }
};

/** Estado de BD y Redis (ping con latencia), pool de conexiones y métricas de las últimas 15 min. */
const getHealth = async ({ withMetrics = false } = {}) => {
  const redis = getRedis();
  const [db, cache] = await Promise.all([
    timed(() => sequelize.query('SELECT 1')),
    redis ? timed(() => redis.ping()) : Promise.resolve({ ok: null, mode: 'memoria (sin REDIS_URL)' }),
  ]);
  const pool = sequelize.connectionManager.pool;
  return {
    status: db.ok ? 'ok' : 'degraded',
    version: pkg.version,
    uptime_s: Math.round(process.uptime()),
    memory_mb: Math.round(process.memoryUsage().rss / 1048576),
    database: { ...db, pool: pool ? { size: pool.size, available: pool.available, using: pool.using, waiting: pool.waiting, max: pool.maxSize } : null },
    redis: cache,
    ...(withMetrics && { metrics: snapshot() }),
  };
};

module.exports = { getHealth };
