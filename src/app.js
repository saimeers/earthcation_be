const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const compression = require('compression');
require('./models');
const { globalLimiter, authLimiter, loginCedulaLimiter, loginIpFailLimiter } = require('./middleware/rateLimit.middleware');
const { metrics } = require('./middleware/metrics.middleware');
const { getHealth } = require('./services/health.service');
const { getPublished } = require('./config/deployStorage');

// La app Express sin arrancar el servidor ni tocar el esquema: la usan server.js y las pruebas (supertest)
const app = express();

// Detrás del proxy de Cloudflare/Railway: req.ip es el del proxy (la IP del visitante sale de
// CF-Connecting-IP, ver utils/clientIp.js)
app.set('trust proxy', 1);

// ALLOWED_ORIGINS admite varios separados por coma (panel, juego); sin definir o con '*', cualquiera
// ('*' dentro de una lista no es comodín para cors: se compararía literal y no saldría el header)
const origins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(o => o && o !== '*');
// Sin R2 (desarrollo) la API sirve el juego publicado como lo haría el Worker. Va antes de helmet:
// su CSP bloquea el wasm y los workers de Unity.
if (getPublished().driver === 'local') app.use('/play-local', require('./routes/playLocal.routes'));

app.use(helmet());
app.use(cors({ origin: origins?.length ? origins : '*' }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan(process.env.NODE_ENV === 'production' ? 'tiny' : 'dev'));
app.use(metrics);

// Estado público mínimo (para monitores externos y Railway); el detalle va en /api/health/details
app.get('/api/health', async (_, res) => {
  const h = await getHealth();
  res.status(h.status === 'ok' ? 200 : 503).json({ status: h.status, version: h.version, uptime_s: h.uptime_s });
});

// Antes del límite global: todas las visitas llegan desde las IP del Worker de Cloudflare
app.use('/api/visits', require('./routes/visit.routes'));

app.use('/api', globalLimiter);
app.use('/api/auth/login', authLimiter, loginIpFailLimiter, loginCedulaLimiter);
app.use('/api/auth/forgot-password', authLimiter);

app.use('/api/auth',      require('./routes/auth.routes'));
app.use('/api/users',     require('./routes/user.routes'));
app.use('/api/users/bulk-import', require('./routes/bulkImport.routes'));
app.use('/api/vark',      require('./routes/vark.routes'));
app.use('/api/progress',  require('./routes/progress.routes'));
app.use('/api/levels',    require('./routes/level.routes'));
app.use('/api/sessions',  require('./routes/session.routes'));
app.use('/api/analytics', require('./routes/analytics.routes'));
app.use('/api/telemetry', require('./routes/telemetry.routes'));
app.use('/api/locations',     require('./routes/location.routes'));
app.use('/api/organizations', require('./routes/organization.routes'));
app.use('/api/health',    require('./routes/health.routes'));
app.use('/api/deploy',    require('./routes/deploy.routes'));

app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date() }));

app.get("/", (req, res) => {
    res.send("API funcionando 🚀");
});

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// Los 4xx llevan un mensaje pensado para el usuario; un 5xx puede traer detalles internos (SQL, rutas),
// así que se registra completo y al cliente solo le llega un mensaje genérico
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    console.error('[ERROR]', err.stack || err.message);
    return res.status(status).json({ error: 'Error interno del servidor' });
  }
  res.status(status).json({ error: err.message });
});

module.exports = app;
