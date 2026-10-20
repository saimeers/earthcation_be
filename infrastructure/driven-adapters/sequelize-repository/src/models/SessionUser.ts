import { DataTypes, type Sequelize } from 'sequelize'

export const defineSessionUser = (sequelize: Sequelize) => sequelize.define('SessionUser', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    session_id: { type: DataTypes.UUID, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    joined_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
    tableName: 'session_users',
    timestamps: false,
    indexes: [{ unique: true, fields: ['session_id', 'user_id'] }]
});
