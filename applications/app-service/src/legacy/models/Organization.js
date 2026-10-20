const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Organization = sequelize.define('Organization', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    type: { type: DataTypes.STRING },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true }
}, { tableName: 'organizations', timestamps: true, createdAt: 'created_at', updatedAt: false });

module.exports = Organization;