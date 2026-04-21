const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const VarkResult = sequelize.define('VarkResult', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  visual_score: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  auditory_score: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  reading_score: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  dominant_style: {
    type: DataTypes.STRING, // Guardará: 'Visual', 'Auditivo', 'Lector' o 'Pendiente'
  }
}, {
  tableName: 'vark_results',
  timestamps: false 
});

module.exports = VarkResult;