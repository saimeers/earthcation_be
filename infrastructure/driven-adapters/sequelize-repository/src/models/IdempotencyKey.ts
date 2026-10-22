import { DataTypes, type Sequelize } from 'sequelize'

// Claves de idempotencia de las peticiones del juego: quién, con qué clave y qué respondió (null mientras se ejecuta).
export const defineIdempotencyKey = (sequelize: Sequelize) => sequelize.define('IdempotencyKey', {
  user_id: { type: DataTypes.UUID, primaryKey: true },
  key: { type: DataTypes.STRING(128), primaryKey: true },
  fingerprint: { type: DataTypes.STRING(64), allowNull: false },
  status_code: { type: DataTypes.INTEGER, allowNull: true },
  response: { type: DataTypes.JSONB, allowNull: true },
  locked_at: { type: DataTypes.DATE, allowNull: false },
  created_at: { type: DataTypes.DATE, allowNull: false },
}, {
  tableName: 'idempotency_keys',
  timestamps: false,
  indexes: [{ name: 'idempotency_keys_created_at', fields: ['created_at'] }],
});
