import { DataTypes, type Sequelize } from 'sequelize'

export const defineLocation = (sequelize: Sequelize) => sequelize.define('Location', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    municipality: { type: DataTypes.STRING },
    department: { type: DataTypes.STRING },
    country: { type: DataTypes.STRING, defaultValue: 'Colombia' },
    is_active:    { type: DataTypes.BOOLEAN, defaultValue: true }
}, { tableName: 'locations', timestamps: false });
