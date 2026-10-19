const sequelize = require('./config/database');
const app = require('./app');
const { seedMunicipios } = require('./scripts/seedMunicipios');
const { runDbMaintenance, ensureEnumValues } = require('./scripts/dbMaintenance');
const { recoverInterrupted } = require('./services/deploy.service');

// Esquema + datos base que la API necesita antes de atender. Las pruebas lo reutilizan sobre su BD.
const prepareDatabase = async () => {
  await sequelize.authenticate();
  console.log('✅ Conexión a PostgreSQL exitosa.');
  await ensureEnumValues(); // valores nuevos de ENUM antes del sync (alter no los agrega bien)
  await sequelize.sync({ alter: true });
  console.log('✅ Tablas sincronizadas.');
  await runDbMaintenance(); // NOT NULL de sesión libre + índices (idempotente)
  await recoverInterrupted(); // publicaciones cortadas por el reinicio → fallidas
  const { created } = await seedMunicipios();
  if (created > 0) console.log(`✅ Catálogo de municipios: ${created} filas nuevas sembradas.`);
};

const start = () => {
  const PORT = process.env.PORT || 3000;
  return prepareDatabase()
    .then(() => app.listen(PORT, () => console.log(`🚀 Servidor en http://localhost:${PORT}`)))
    .catch(err => {
      console.error('❌ Error DB:', err.message);
      process.exit(1);
    });
};

module.exports = { prepareDatabase, start };
