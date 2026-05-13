const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TrainingSession = sequelize.define('TrainingSession', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    instructor_id: { type: DataTypes.UUID, allowNull: false },
    location_id: { type: DataTypes.UUID, allowNull: false }, // <-- NUEVO CAMPO AÑADIDO
    name: { type: DataTypes.STRING, allowNull: false },
    code: {
        type: DataTypes.STRING(8),
        unique: true,
        allowNull: false
    },
    status: {
        type: DataTypes.ENUM('waiting', 'active', 'finished'),
        defaultValue: 'waiting'
    },
    started_at: { type: DataTypes.DATE, allowNull: true },
    ended_at:   { type: DataTypes.DATE, allowNull: true }
}, {
    tableName: 'training_sessions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
});

module.exports = TrainingSession;