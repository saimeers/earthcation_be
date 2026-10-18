const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Ajustes globales clave → valor (JSON). Hoy: 'active_version_id' (versión del juego publicada).
// Un solo puntero, cambiado en transacción, evita el "dos versiones activas" de un booleano por fila.
const GameSetting = sequelize.define('GameSetting', {
  key: { type: DataTypes.STRING(60), primaryKey: true },
  value: { type: DataTypes.JSONB, allowNull: true },
}, {
  tableName: 'game_settings',
  timestamps: true,
  createdAt: false,
  updatedAt: 'updated_at',
});

module.exports = GameSetting;
