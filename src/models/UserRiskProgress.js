const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UserRiskProgress = sequelize.define('UserRiskProgress', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  is_mitigated: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  mistakes_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  reaction_time_ms: {
    type: DataTypes.FLOAT,
    allowNull: true,
  }
}, {
  tableName: 'user_risk_progress',
  timestamps: true,
  createdAt: 'recorded_at',
  updatedAt: false
});

module.exports = UserRiskProgress;