const sequelize = require('./config/database');
const app = require('./app');
const { seedMunicipios } = require('./scripts/seedMunicipios');
const { migrate } = require('./infrastructure/migrations');
const { recoverInterrupted } = require('./services/deploy.service');

// Esquema + datos base que la API necesita antes de atender. Las pruebas lo reutilizan sobre su BD.
const prepareDatabase = async () => {
  await sequelize.authenticate();
  console.log('✅ Conexión a PostgreSQL exitosa.');
  // Esquema por migraciones versionadas (infrastructure/migrations); ya no hay sync({ alter: true }) al arrancar
  const applied = await migrate(sequelize);
  console.log(applied.length ? `✅ Migraciones aplicadas: ${applied.join(', ')}` : '✅ Esquema al día.');
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
