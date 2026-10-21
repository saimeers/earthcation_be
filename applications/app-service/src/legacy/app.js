const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const compression = require('compression');
require('./models');
const { globalLimiter, authLimiter, loginCedulaLimiter, loginIpFailLimiter } = require('./middleware/rateLimit.middleware');
const { errorHandlerV1, notFoundV1 } = require('@earthcation/rest-api');
const container = require('../container');

// La app Express sin arrancar el servidor ni tocar el esquema: la usan server.js y las pruebas (supertest)
const app = express();

// Detrás del proxy de Cloudflare/Railway: req.ip es el del proxy (la IP del visitante sale de
// CF-Connecting-IP, ver middlewares/cloudflare.ts en rest-api)
app.set('trust proxy', 1);

// ALLOWED_ORIGINS admite varios separados por coma (panel, juego); sin definir o con '*', cualquiera
// ('*' dentro de una lista no es comodín para cors: se compararía literal y no saldría el header)
const origins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(o => o && o !== '*');
// Sin R2 (desarrollo) la API sirve el juego publicado como lo haría el Worker. Va antes de helmet:
// su CSP bloquea el wasm y los workers de Unity.
if (container.deployment.localPublishing) app.use('/play-local', container.routes.playLocal);

app.use(helmet());
app.use(cors({ origin: origins?.length ? origins : '*' }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan(process.env.NODE_ENV === 'production' ? 'tiny' : 'dev'));
app.use(container.metricsMiddleware);

// Estado público mínimo (para monitores externos y Railway); el detalle va en /api/health/details
app.get('/api/health', container.routes.publicHealth);

// Antes del límite global: todas las visitas llegan desde las IP del Worker de Cloudflare
app.use('/api/visits', container.routes.visits);

app.use('/api', globalLimiter);
app.use('/api/auth/login', authLimiter, loginIpFailLimiter, loginCedulaLimiter);
app.use('/api/auth/forgot-password', authLimiter);

app.use('/api/auth',      container.routes.auth);
app.use('/api/users',     container.routes.users);
app.use('/api/users/bulk-import', container.routes.bulkImport);
app.use('/api/sessions',  require('./contexts/sessions').sessionRoutesV1);
// Contextos ya migrados a la arquitectura limpia: sus rutas las arma el composition root
app.use('/api/locations',     container.routes.locations);
app.use('/api/organizations', container.routes.organizations);
app.use('/api/vark',          container.routes.vark);
app.use('/api/health',    container.routes.health);
app.use('/api/deploy',    container.routes.deploy);
app.use('/api/progress',  container.routes.progress);
app.use('/api/levels',    container.routes.levels);
app.use('/api/analytics', container.routes.analytics);
app.use('/api/telemetry', container.routes.telemetry);

app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date() }));

app.get("/", (req, res) => {
    res.send("API funcionando 🚀");
});

// Un único errorHandler (rest-api) traduce los errores de dominio y los de Express a la respuesta de v1
app.use(notFoundV1);
app.use(errorHandlerV1((message) => console.error(message)));

module.exports = app;
