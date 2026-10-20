const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const compression = require('compression');
require('./models');
const { globalLimiter, authLimiter, loginCedulaLimiter, loginIpFailLimiter } = require('./middleware/rateLimit.middleware');
const observability = require('./contexts/observability');
const deployment = require('./contexts/deployment');
const { errorHandlerV1, notFoundV1 } = require('@earthcation/rest-api');

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
if (deployment.isLocalPublishing()) app.use('/play-local', deployment.playLocalRoutes());

app.use(helmet());
app.use(cors({ origin: origins?.length ? origins : '*' }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan(process.env.NODE_ENV === 'production' ? 'tiny' : 'dev'));
app.use(observability.metrics);

// Estado público mínimo (para monitores externos y Railway); el detalle va en /api/health/details
app.get('/api/health', observability.publicHealth);

// Antes del límite global: todas las visitas llegan desde las IP del Worker de Cloudflare
app.use('/api/visits', observability.visitRoutesV1);

app.use('/api', globalLimiter);
app.use('/api/auth/login', authLimiter, loginIpFailLimiter, loginCedulaLimiter);
app.use('/api/auth/forgot-password', authLimiter);

app.use('/api/auth',      require('./contexts/identity').authRoutesV1);
app.use('/api/users',     require('./contexts/identity').userRoutesV1);
app.use('/api/users/bulk-import', require('./contexts/identity').bulkImportRoutesV1);
app.use('/api/vark',      require('./contexts/vark').varkRoutesV1);
app.use('/api/progress',  require('./contexts/learning').progressRoutesV1);
app.use('/api/levels',    require('./contexts/learning').levelRoutesV1);
app.use('/api/sessions',  require('./contexts/sessions').sessionRoutesV1);
app.use('/api/analytics', require('./contexts/learning').analyticsRoutesV1);
app.use('/api/telemetry', require('./contexts/learning').telemetryRoutesV1);
app.use('/api/locations',     require('./contexts/catalog').locationRoutesV1);
app.use('/api/organizations', require('./contexts/catalog').organizationRoutesV1);
app.use('/api/health',    observability.healthRoutesV1);
app.use('/api/deploy',    deployment.deployRoutesV1);

app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date() }));

app.get("/", (req, res) => {
    res.send("API funcionando 🚀");
});

// Un único errorHandler (rest-api) traduce los errores de dominio y los de Express a la respuesta de v1
app.use(notFoundV1);
app.use(errorHandlerV1((message) => console.error(message)));

module.exports = app;
