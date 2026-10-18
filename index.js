require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const compression = require('compression');
const sequelize = require('./src/config/database');
require('./src/models');
const { seedMunicipios } = require('./src/scripts/seedMunicipios');
const { runDbMaintenance, ensureEnumValues } = require('./src/scripts/dbMaintenance');
const { globalLimiter, authLimiter } = require('./src/middleware/rateLimit.middleware');
const { metrics } = require('./src/middleware/metrics.middleware');
const { getHealth } = require('./src/services/health.service');

const app = express();

// Detrás del proxy de Cloudflare/Railway: req.ip es el del proxy (la IP del visitante sale de
// CF-Connecting-IP, ver utils/clientIp.js)
app.set('trust proxy', 1);

// ALLOWED_ORIGINS admite varios separados por coma (panel, juego); sin definir, cualquiera
const origins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean);
app.use(helmet());
app.use(cors({ origin: origins?.length ? origins : '*' }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'tiny' : 'dev'));
app.use(metrics);

// Estado público mínimo (para monitores externos y Railway); el detalle va en /api/health/details
app.get('/api/health', async (_, res) => {
  const h = await getHealth();
  res.status(h.status === 'ok' ? 200 : 503).json({ status: h.status, version: h.version, uptime_s: h.uptime_s });
});

app.use('/api', globalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);

app.use('/api/auth',      require('./src/routes/auth.routes'));
app.use('/api/users',     require('./src/routes/user.routes'));
app.use('/api/users/bulk-import', require('./src/routes/bulkImport.routes'));
app.use('/api/vark',      require('./src/routes/vark.routes'));
app.use('/api/progress',  require('./src/routes/progress.routes'));
app.use('/api/levels',    require('./src/routes/level.routes'));
app.use('/api/sessions',  require('./src/routes/session.routes'));
app.use('/api/analytics', require('./src/routes/analytics.routes'));
app.use('/api/telemetry', require('./src/routes/telemetry.routes'));
app.use('/api/locations',     require('./src/routes/location.routes'));
app.use('/api/organizations', require('./src/routes/organization.routes'));
app.use('/api/health',    require('./src/routes/health.routes'));

app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date() }));

app.get("/", (req, res) => {
    res.send("API funcionando 🚀");
});

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.message}`);
  res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;

sequelize.authenticate()
  .then(() => {
    console.log('✅ Conexión a PostgreSQL exitosa.');
    return ensureEnumValues(); // valores nuevos de ENUM antes del sync (alter no los agrega bien)
  })
  .then(() => {
    return sequelize.sync({ alter: true });
  })
  .then(() => {
    console.log('✅ Tablas sincronizadas.');
    return runDbMaintenance(); // NOT NULL de sesión libre + índices (idempotente)
  })
  .then(() => {
    return seedMunicipios();
  })
  .then(({ created }) => {
    if (created > 0) console.log(`✅ Catálogo de municipios: ${created} filas nuevas sembradas.`);
    app.listen(PORT, () => console.log(`🚀 Servidor en http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('❌ Error DB:', err.message); 
    process.exit(1);
  });