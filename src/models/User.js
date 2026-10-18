const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  password_hash: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  first_name: {
    type: DataTypes.STRING,
  },
  last_name: {
    type: DataTypes.STRING,
  },
  email: {
    // No es único a propósito — muchos trabajadores registran el correo de la empresa
    // en vez del propio (ver bulk import ANM), así que varias personas pueden compartirlo.
    // La cédula es el identificador real de login, no el correo.
    type: DataTypes.STRING,
    allowNull: true,
    validate: { isEmail: true }
  },
  age: {
    type: DataTypes.INTEGER,
  },
  cedula: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  role: {
    type: DataTypes.ENUM('player', 'instructor', 'admin'),
    defaultValue: 'player',
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  reset_token_hash: { type: DataTypes.STRING, allowNull: true },
  reset_token_expires: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'users',
  timestamps: true,
  // Unicidad como índices CON NOMBRE: `unique: true` en la columna hacía que sync({ alter }) agregara
  // una restricción UNIQUE nueva en cada arranque (había 92 en username y 88 en cédula)
  indexes: [
    { name: 'users_username_unique', unique: true, fields: ['username'] },
    { name: 'users_cedula_unique', unique: true, fields: ['cedula'] },
  ],
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = User; 