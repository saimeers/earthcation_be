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

// Login: solo cuentan los intentos fallidos (skipSuccessfulRequests), así 50 jugadores que entran bien
// desde la IP del salón no se bloquean, pero adivinar cédulas sí.
const FAILED_WINDOW_MS = 15 * 60 * 1000;
const hashCedula = (req) => require('crypto').createHash('sha256').update(String(req.body?.cedula ?? '')).digest('hex');

// Por cédula: frena que alguien pruebe muchas veces una misma cuenta
const loginCedulaLimiter = createLimiter('rl:login-cedula:', {
  windowMs: FAILED_WINDOW_MS,
  limit: Number(process.env.RATE_LIMIT_LOGIN_CEDULA_MAX) || 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `c:${hashCedula(req)}`,
  message: { error: 'Demasiados intentos con esa cédula, intenta de nuevo en unos minutos.' },
});

// Por IP: frena que desde un mismo lugar se prueben muchas cédulas que no existen (adivinar). Las
// cédulas registradas no cuentan ni se bloquean aquí: si no, los errores de tipeo de un salón entero
// (todos con la misma IP) dejarían sin entrar también a quienes escriben bien la suya.
const cedulaExists = async (req) => {
  const cedula = String(req.body?.cedula ?? '').trim();
  if (!cedula) return false;
  const { User } = require('../models');
  return (await User.count({ where: { cedula } })) > 0;
};
const loginIpFailLimiter = createLimiter('rl:login-ip:', {
  windowMs: FAILED_WINDOW_MS,
  limit: Number(process.env.RATE_LIMIT_LOGIN_IP_FAIL_MAX) || 60,
  skip: cedulaExists,
  keyGenerator: (req) => `ip:${ipKeyGenerator(clientIp(req))}`,
  message: { error: 'Demasiados intentos fallidos desde esta red, intenta de nuevo en unos minutos.' },
});

module.exports = { createLimiter, globalLimiter, authLimiter, loginCedulaLimiter, loginIpFailLimiter };
