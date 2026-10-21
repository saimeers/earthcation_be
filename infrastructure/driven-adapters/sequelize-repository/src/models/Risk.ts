import { DataTypes, type Sequelize } from 'sequelize'

export const defineRisk = (sequelize: Sequelize) => sequelize.define('Risk', {
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
