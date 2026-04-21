const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Risk = sequelize.define('Risk', {
  id: {
    type: DataTypes.STRING, // Ej: 'CR-01'
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  category: {
    type: DataTypes.STRING,
  }
}, {
  tableName: 'risks',
  timestamps: false
});

module.exports = Risk;