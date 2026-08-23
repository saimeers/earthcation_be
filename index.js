require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const sequelize = require('./src/config/database');
require('./src/models');

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS || '*' }));
app.use(express.json());
app.use(morgan('dev'));

app.use('/api/auth',      require('./src/routes/auth.routes'));
app.use('/api/users',     require('./src/routes/user.routes'));
app.use('/api/users/bulk-import', require('./src/routes/bulkImport.routes'));
app.use('/api/vark',      require('./src/routes/vark.routes'));
app.use('/api/progress',  require('./src/routes/progress.routes'));
app.use('/api/levels',    require('./src/routes/level.routes'));
app.use('/api/sessions',  require('./src/routes/session.routes'));
app.use('/api/analytics', require('./src/routes/analytics.routes'));
app.use('/api/locations',     require('./src/routes/location.routes'));
app.use('/api/organizations', require('./src/routes/organization.routes'));

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
    return sequelize.sync({ alter: true });
  })
  .then(() => {
    console.log('✅ Tablas sincronizadas.');
    app.listen(PORT, () => console.log(`🚀 Servidor en http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('❌ Error DB:', err.message); 
    process.exit(1);
  });