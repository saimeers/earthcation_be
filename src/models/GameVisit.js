const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Una apertura del juego en play.earthcation.saimers.dev, la reporta el Worker (earthcation_play) con la
// ubicación de Cloudflare. Sin IP: `visitor` es HMAC(VISIT_SALT, ip) calculado en el Worker.
const GameVisit = sequelize.define('GameVisit', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  visitor: { type: DataTypes.STRING(64), allowNull: true },
  // Primera apertura de ese visitante en 30 min (recargar no cuenta como otra visita)
  is_unique: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  version_id: { type: DataTypes.UUID, allowNull: true },
  country: { type: DataTypes.STRING(2), allowNull: true },
  region: { type: DataTypes.STRING(80), allowNull: true },
  city: { type: DataTypes.STRING(80), allowNull: true },
  colo: { type: DataTypes.STRING(8), allowNull: true },             // centro de datos de Cloudflare
  latitude: { type: DataTypes.FLOAT, allowNull: true },
  longitude: { type: DataTypes.FLOAT, allowNull: true },
  device: { type: DataTypes.STRING(10), allowNull: true },          // mobile | tablet | desktop
  os: { type: DataTypes.STRING(20), allowNull: true },
  browser: { type: DataTypes.STRING(20), allowNull: true },
  session_code: { type: DataTypes.STRING(3), allowNull: true },     // llegó por el QR de una sala
}, {
  tableName: 'game_visits',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [{ name: 'game_visits_created_at', fields: ['created_at'] }],
});

module.exports = GameVisit;
