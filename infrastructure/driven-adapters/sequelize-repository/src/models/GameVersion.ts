import { DataTypes, type Sequelize } from 'sequelize'

// Una versión del build WebGL del juego. El ZIP original queda en S3 (respaldo, para rollback) y los
// archivos publicados en R2 bajo `builds/<id>/`, que sirve el Worker de play.earthcation.saimers.dev.
// La versión activa la marca game_settings.active_version_id (un solo puntero, ver GameSetting).
export const defineGameVersion = (sequelize: Sequelize) => sequelize.define('GameVersion', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  label: { type: DataTypes.STRING(40), allowNull: false },          // p. ej. "1.4.0"
  notes: { type: DataTypes.TEXT, allowNull: true },
  // uploading: esperando el ZIP · processing: publicándose · ready: lista para activar · failed
  status: {
    type: DataTypes.ENUM('uploading', 'processing', 'ready', 'failed'),
    allowNull: false,
    defaultValue: 'uploading',
  },
  s3_key: { type: DataTypes.STRING, allowNull: true },              // ZIP original
  r2_prefix: { type: DataTypes.STRING, allowNull: true },           // builds/<id>/
  manifest: { type: DataTypes.JSONB, allowNull: true },             // archivos, tamaños, compresión
  size_bytes: { type: DataTypes.BIGINT, allowNull: true },          // del ZIP
  error: { type: DataTypes.TEXT, allowNull: true },
  uploaded_by: { type: DataTypes.UUID, allowNull: true },
  published_at: { type: DataTypes.DATE, allowNull: true },          // cuando quedó lista
  activated_at: { type: DataTypes.DATE, allowNull: true },          // última vez que se activó
}, {
  tableName: 'game_versions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [{ name: 'game_versions_created_at', fields: ['created_at'] }],
});
