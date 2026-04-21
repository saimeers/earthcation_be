const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SessionUser = sequelize.define('SessionUser', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    session_id: { type: DataTypes.UUID, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    joined_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'session_users', timestamps: false });

module.exports = SessionUser;