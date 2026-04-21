const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UserProfile = sequelize.define('UserProfile', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    user_id: { type: DataTypes.UUID, allowNull: false, unique: true },
    organization_id: { type: DataTypes.UUID, allowNull: true },
    location_id: { type: DataTypes.UUID, allowNull: true }
}, { tableName: 'user_profiles', timestamps: false });

module.exports = UserProfile;