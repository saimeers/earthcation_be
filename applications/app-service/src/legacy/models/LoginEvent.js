const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Inicio de sesión exitoso con la ubicación que da Cloudflare (headers cf-*), para soporte y analítica.
const LoginEvent = sequelize.define('LoginEvent', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id: { type: DataTypes.UUID, allowNull: false },
  role: { type: DataTypes.STRING(20), allowNull: false },
  country: { type: DataTypes.STRING(2), allowNull: true },
  region: { type: DataTypes.STRING(80), allowNull: true },
  city: { type: DataTypes.STRING(80), allowNull: true },
  device: { type: DataTypes.STRING(10), allowNull: true },
  os: { type: DataTypes.STRING(20), allowNull: true },
  browser: { type: DataTypes.STRING(20), allowNull: true },
}, {
  tableName: 'login_events',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { name: 'login_events_created_at', fields: ['created_at'] },
    { name: 'login_events_user_id', fields: ['user_id'] },
  ],
});

module.exports = LoginEvent;
