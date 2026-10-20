import { DataTypes, type Sequelize } from 'sequelize'

export const defineTrainingSession = (sequelize: Sequelize) => sequelize.define('TrainingSession', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // null en las sesiones "Juego libre" (is_free_play): no tienen instructor; sin ubicación = la global
    instructor_id: { type: DataTypes.UUID, allowNull: true },
    location_id: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    code: {
        type: DataTypes.STRING(8),
        // Único solo entre salas no finalizadas (índice parcial en scripts/dbMaintenance.js): una sala
        // finalizada libera su código, necesario con solo 1000 combinaciones
        allowNull: true // la sesión libre no tiene código: no se une por código
    },
    is_free_play: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
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
