import { DataTypes, type Sequelize } from 'sequelize'

// Evento puntual dentro de un intento: qué hizo el jugador o qué le pasó, cuándo y dónde.
// event_type es texto libre (ver docs/TELEMETRY.md para el catálogo que envía el juego).
export const defineGameEvent = (sequelize: Sequelize) => sequelize.define('GameEvent', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  event_type: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  risk_id: {
    type: DataTypes.STRING, // sin FK a propósito: no se pierde el evento si el riesgo no existe
    allowNull: true,
  },
  stage: {
    type: DataTypes.STRING, // etapa del nivel al momento del evento
    allowNull: true,
  },
  t_ms: {
    type: DataTypes.FLOAT, // milisegundos desde el inicio del intento
    allowNull: true,
  },
  pos_x: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  health: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  fatigue: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  payload: {
    type: DataTypes.JSONB, // datos propios del evento (lecturas de gas, tiempo de reacción, etc.)
    allowNull: true,
  },
}, {
  tableName: 'game_events',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [{ fields: ['attempt_id'] }, { fields: ['user_id'] }, { fields: ['event_type'] }],
});
