const User           = require('./User');
const VarkResult     = require('./VarkResult');
const Level          = require('./Level');
const Risk           = require('./Risk');
const UserRiskProgress = require('./UserRiskProgress');
const Organization   = require('./Organization');
const Location       = require('./Location');
const UserProfile    = require('./UserProfile');
const TrainingSession = require('./TrainingSession');
const SessionUser    = require('./SessionUser');
const LevelAttempt   = require('./LevelAttempt');
const GameEvent      = require('./GameEvent');
const GameVersion    = require('./GameVersion');
const GameSetting    = require('./GameSetting');

// Usuario
User.hasOne(VarkResult,     { foreignKey: 'user_id', as: 'varkProfile' });
User.hasMany(UserRiskProgress, { foreignKey: 'user_id', as: 'progress' });
User.hasOne(UserProfile,    { foreignKey: 'user_id', as: 'profile' });
User.hasMany(TrainingSession, { foreignKey: 'instructor_id', as: 'sessions' });
User.hasMany(SessionUser,   { foreignKey: 'user_id', as: 'enrollments' });

VarkResult.belongsTo(User,  { foreignKey: 'user_id', as: 'user'});
UserRiskProgress.belongsTo(User, { foreignKey: 'user_id' });
UserProfile.belongsTo(User, { foreignKey: 'user_id', as: 'user'});
SessionUser.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Org y ubicación
Organization.hasMany(UserProfile, { foreignKey: 'organization_id', as: 'members' });
Location.hasMany(UserProfile,     { foreignKey: 'location_id', as: 'residents' });
UserProfile.belongsTo(Organization, { foreignKey: 'organization_id', as: 'organization' });
UserProfile.belongsTo(Location,     { foreignKey: 'location_id', as: 'location' });

// Niveles y riesgos
Level.hasMany(Risk, { foreignKey: 'level_id', as: 'risks' });
Risk.belongsTo(Level, { foreignKey: 'level_id', as: 'level' });
Risk.hasMany(UserRiskProgress, { foreignKey: 'risk_id', as: 'attempts' });
UserRiskProgress.belongsTo(Risk, { foreignKey: 'risk_id', as: 'risk' });

// Sesiones
TrainingSession.hasMany(SessionUser,      { foreignKey: 'session_id', as: 'participants' });
TrainingSession.hasMany(UserRiskProgress, { foreignKey: 'session_id', as: 'progress' });
TrainingSession.belongsTo(User, { foreignKey: 'instructor_id', as: 'instructor' });
TrainingSession.belongsTo(Location, { foreignKey: 'location_id', as: 'location' });
Location.hasMany(TrainingSession, { foreignKey: 'location_id', as: 'sessions' });
SessionUser.belongsTo(TrainingSession, { foreignKey: 'session_id', as: 'session' });
UserRiskProgress.belongsTo(TrainingSession, { foreignKey: 'session_id', as: 'session' });

// Telemetría: intentos por nivel y eventos dentro de cada intento
User.hasMany(LevelAttempt, { foreignKey: 'user_id', as: 'attempts' });
LevelAttempt.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Level.hasMany(LevelAttempt, { foreignKey: 'level_id', as: 'attempts' });
LevelAttempt.belongsTo(Level, { foreignKey: 'level_id', as: 'level' });
TrainingSession.hasMany(LevelAttempt, { foreignKey: 'session_id', as: 'attempts' });
LevelAttempt.belongsTo(TrainingSession, { foreignKey: 'session_id', as: 'session' });
LevelAttempt.hasMany(GameEvent, { foreignKey: 'attempt_id', as: 'events' });
GameEvent.belongsTo(LevelAttempt, { foreignKey: 'attempt_id', as: 'attempt' });
User.hasMany(GameEvent, { foreignKey: 'user_id', as: 'events' });
GameEvent.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
LevelAttempt.hasMany(UserRiskProgress, { foreignKey: 'attempt_id', as: 'riskResults' });
UserRiskProgress.belongsTo(LevelAttempt, { foreignKey: 'attempt_id', as: 'attempt' });

// Despliegue del juego
GameVersion.belongsTo(User, { foreignKey: 'uploaded_by', as: 'uploader', constraints: false });

module.exports = {
    GameVersion, GameSetting,
    LevelAttempt, GameEvent,
    User, VarkResult, Level, Risk, UserRiskProgress,
    Organization, Location, UserProfile,
    TrainingSession, SessionUser
};