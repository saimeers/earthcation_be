const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { getRedis } = require('../config/redis');
const { RedisRateLimitStore } = require('../utils/rateLimitStore');
const { clientIp } = require('../utils/clientIp');
const { verifyToken } = require('../utils/jwt.utils');

// Usuario del token (sin fallar si no hay o es inválido: eso lo decide auth.middleware después)
const tokenUserId = (req) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return null;
  try { return verifyToken(token).id ?? null; } catch { return null; }
};

/**
 * Limitador con contadores en Redis cuando hay (sobreviven a los despliegues); si Redis falla, deja
 * pasar en vez de tumbar la API. Un salón entero comparte una IP pública (50 jugadores ≈ 11 000
 * peticiones cada 15 min), así que las peticiones con token se cuentan por usuario y solo las
 * anónimas por IP (la del visitante detrás de Cloudflare, ver utils/clientIp.js).
 * @param {string} prefix prefijo de las claves, ej. 'rl:global:'
 * @param {import('express-rate-limit').Options & { anonymousMax?: number }} options
 */
const createLimiter = (prefix, { limit, anonymousMax, ...options }) => {
  const redis = getRedis();
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    keyGenerator: (req) => {
      const userId = tokenUserId(req);
      return userId ? `u:${userId}` : `ip:${ipKeyGenerator(clientIp(req))}`;
    },
    limit: (req) => (tokenUserId(req) ? limit : (anonymousMax ?? limit)),
    ...(redis && { store: new RedisRateLimitStore(redis, prefix) }),
    message: { error: 'Demasiadas peticiones, intenta de nuevo en unos minutos.' },
    ...options,
  });
};

// Global: por usuario holgado (un jugador activo hace ~15 peticiones/min); anónimas por IP, pensando
// en un salón detrás de una sola IP
const globalLimiter = createLimiter('rl:global:', {
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_USER_MAX) || 1500,
  anonymousMax: Number(process.env.RATE_LIMIT_IP_MAX) || 3000,
});

// Login y recuperación: por IP (50 jugadores entrando a la vez desde un salón caben de sobra)
const authLimiter = createLimiter('rl:auth:', {
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_AUTH_MAX) || 300,
});

module.exports = { createLimiter, globalLimiter, authLimiter };
