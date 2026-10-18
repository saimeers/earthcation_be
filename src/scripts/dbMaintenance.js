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

const runDbMaintenance = async () => {
  for (const sql of STATEMENTS) await sequelize.query(sql);
};

module.exports = { runDbMaintenance };
