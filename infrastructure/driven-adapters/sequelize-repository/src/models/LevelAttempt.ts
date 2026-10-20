import { DataTypes, type Sequelize } from 'sequelize'

// Un intento de un jugador en un nivel (cada vez que entra o reintenta). Agrupa los eventos de
// telemetría (GameEvent) y los resultados por riesgo (UserRiskProgress) de esa partida.
export const defineLevelAttempt = (sequelize: Sequelize) => sequelize.define('LevelAttempt', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  level_key: {
    type: DataTypes.STRING, // 'level1', 'level2' — estable aunque cambie el nombre del Level
    allowNull: false,
  },
  attempt_number: {
    type: DataTypes.INTEGER, // 1 = primera vez; >1 = reintentos de ese jugador en ese nivel
    allowNull: false,
    defaultValue: 1,
  },
  outcome: {
    type: DataTypes.STRING, // 'in_progress' | 'completed' | 'failed' | 'abandoned'
    allowNull: false,
    defaultValue: 'in_progress',
  },
  fail_reason: {
    type: DataTypes.STRING, // ej. 'derrumbe', 'intoxicacion_metano', 'mordedura_ofidio', 'fatiga'
    allowNull: true,
  },
  fail_risk_id: {
    type: DataTypes.STRING, // ej. 'CR-04' — riesgo que causó la muerte
    allowNull: true,
  },
  fail_stage: {
    type: DataTypes.STRING, // etapa del nivel donde falló (ej. 'PlacingSupport1')
    allowNull: true,
  },
  duration_ms: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  final_health: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  vark_style: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  gas_brand: {
    type: DataTypes.STRING, // detector multigás elegido
    allowNull: true,
  },
  game_version: {
    type: DataTypes.STRING(20), // Application.version del build que jugó (soporte: qué versión tenía)
    allowNull: true,
  },
  device_calibrated: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
  },
  summary: {
    type: DataTypes.JSONB, // contadores libres del nivel (carbón, daño recibido, aperturas del detector...)
    allowNull: true,
  },
  ended_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'level_attempts',
  timestamps: true,
  createdAt: 'started_at',
  updatedAt: false,
});
