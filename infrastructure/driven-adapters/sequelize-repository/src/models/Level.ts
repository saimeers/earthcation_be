import { DataTypes, type Sequelize } from 'sequelize'

export const defineLevel = (sequelize: Sequelize) => sequelize.define('Level', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  }
}, {
  tableName: 'levels',
  timestamps: false
});
