import { DataTypes, type Sequelize } from 'sequelize'

// Ajustes globales clave → valor (JSON). Hoy: 'active_version_id' (versión del juego publicada).
// Un solo puntero, cambiado en transacción, evita el "dos versiones activas" de un booleano por fila.
export const defineGameSetting = (sequelize: Sequelize) => sequelize.define('GameSetting', {
  key: { type: DataTypes.STRING(60), primaryKey: true },
  value: { type: DataTypes.JSONB, allowNull: true },
}, {
  tableName: 'game_settings',
  timestamps: true,
  createdAt: false,
  updatedAt: 'updated_at',
});
