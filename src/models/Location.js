const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Location = sequelize.define('Location', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    municipality: { type: DataTypes.STRING },
    department: { type: DataTypes.STRING },
    country: { type: DataTypes.STRING, defaultValue: 'Colombia' }
}, { tableName: 'locations', timestamps: false });

module.exports = Location;