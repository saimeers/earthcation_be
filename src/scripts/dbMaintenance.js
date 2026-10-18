const sequelize = require('../config/database');

// Ajustes de esquema que `sync({ alter: true })` no hace (o hace mal), idempotentes en cada arranque.
const STATEMENTS = [
  // alter no quita el NOT NULL de columnas con llave foránea: la sesión "Juego libre" no tiene
  // instructor y la global no tiene ubicación
  'ALTER TABLE training_sessions ALTER COLUMN instructor_id DROP NOT NULL, ALTER COLUMN location_id DROP NOT NULL',

  // Índices de las tablas que escribe el juego y que el panel consulta por sesión/usuario.
  // Postgres no indexa las llaves foráneas solo; sin esto cada consulta recorre la tabla entera.
  'CREATE INDEX IF NOT EXISTS level_attempts_session_id ON level_attempts (session_id)',
  'CREATE INDEX IF NOT EXISTS level_attempts_user_level ON level_attempts (user_id, level_key)',
  'CREATE INDEX IF NOT EXISTS user_risk_progress_session_id ON user_risk_progress (session_id)',
  'CREATE INDEX IF NOT EXISTS user_risk_progress_user_id ON user_risk_progress (user_id)',
  'CREATE INDEX IF NOT EXISTS user_risk_progress_attempt_id ON user_risk_progress (attempt_id)',
  'CREATE INDEX IF NOT EXISTS user_risk_progress_recorded_at ON user_risk_progress (recorded_at)',
  'CREATE INDEX IF NOT EXISTS game_events_created_at ON game_events (created_at)',
];

// Restricciones UNIQUE que sync({ alter }) apiló por `unique: true` en la columna (una por arranque).
// La unicidad ahora la dan índices con nombre (modelos) o el índice parcial de abajo.
const STACKED_UNIQUES = [
  { table: 'users', column: 'username' },
  { table: 'users', column: 'cedula' },
  { table: 'training_sessions', column: 'code' },
];

const dropStackedUniques = async () => {
  for (const { table, column } of STACKED_UNIQUES) {
    const [rows] = await sequelize.query(
      `SELECT conname FROM pg_constraint WHERE conrelid = '${table}'::regclass AND contype = 'u'
         AND conname ~ '^${table}_${column}_key[0-9]*$'`);
    if (!rows.length) continue;
    const list = rows.map(r => `DROP CONSTRAINT "${r.conname}"`).join(', ');
    await sequelize.query(`ALTER TABLE ${table} ${list}`);
    console.log(`🧹 ${table}.${column}: ${rows.length} restricciones UNIQUE apiladas eliminadas`);
  }
};

// Valores de ENUM que sync({ alter }) no agrega de forma fiable en Postgres. Va ANTES del sync; ADD VALUE
// no puede ir en una transacción y la tabla puede no existir aún en una BD nueva (de ahí el IF EXISTS).
const ensureEnumValues = async () => {
  await sequelize.query(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_users_role') THEN
      ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'developer';
    END IF;
  END $$;`);
};

const runDbMaintenance = async () => {
  for (const sql of STATEMENTS) await sequelize.query(sql);
  await dropStackedUniques();
  // Código de sala único solo entre salas vivas (una finalizada libera su código)
  await sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS training_sessions_code_live
    ON training_sessions (code) WHERE code IS NOT NULL AND status <> 'finished'`);
};

module.exports = { runDbMaintenance, ensureEnumValues };
