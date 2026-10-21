import { DataTypes, type Sequelize } from 'sequelize'

// Registro de auditoría: solo se inserta. La migración 0002 agrega un disparador que rechaza UPDATE, DELETE y TRUNCATE.
export const defineAuditLog = (sequelize: Sequelize) => sequelize.define('AuditLog', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  occurred_at: { type: DataTypes.DATE, allowNull: false },
  actor_id: { type: DataTypes.UUID, allowNull: true },
  actor_role: { type: DataTypes.STRING(20), allowNull: true },
  action: { type: DataTypes.STRING(60), allowNull: false },
  target_type: { type: DataTypes.STRING(40), allowNull: false },
  target_id: { type: DataTypes.STRING(64), allowNull: true },
  changes: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  ip_hash: { type: DataTypes.STRING(64), allowNull: true },
  user_agent: { type: DataTypes.STRING(300), allowNull: true },
}, {
  tableName: 'audit_logs',
  timestamps: false,
  indexes: [
    { name: 'audit_logs_occurred_at', fields: ['occurred_at'] },
    { name: 'audit_logs_actor_id', fields: ['actor_id', 'occurred_at'] },
    { name: 'audit_logs_action', fields: ['action', 'occurred_at'] },
    { name: 'audit_logs_target', fields: ['target_type', 'target_id'] },
  ],
});
