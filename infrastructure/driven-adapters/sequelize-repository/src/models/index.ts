import type { Sequelize } from 'sequelize'
import { defineGameEvent } from './GameEvent'
import { defineGameSetting } from './GameSetting'
import { defineGameVersion } from './GameVersion'
import { defineGameVisit } from './GameVisit'
import { defineLevel } from './Level'
import { defineLevelAttempt } from './LevelAttempt'
import { defineLocation } from './Location'
import { defineLoginEvent } from './LoginEvent'
import { defineOrganization } from './Organization'
import { defineRisk } from './Risk'
import { defineSessionUser } from './SessionUser'
import { defineTrainingSession } from './TrainingSession'
import { defineUser } from './User'
import { defineUserProfile } from './UserProfile'
import { defineUserRiskProgress } from './UserRiskProgress'
import { defineVarkResult } from './VarkResult'

const defineAll = (sequelize: Sequelize) => ({
  User: defineUser(sequelize), VarkResult: defineVarkResult(sequelize), Level: defineLevel(sequelize), Risk: defineRisk(sequelize),
  UserRiskProgress: defineUserRiskProgress(sequelize), Organization: defineOrganization(sequelize), Location: defineLocation(sequelize),
  UserProfile: defineUserProfile(sequelize), TrainingSession: defineTrainingSession(sequelize), SessionUser: defineSessionUser(sequelize),
  LevelAttempt: defineLevelAttempt(sequelize), GameEvent: defineGameEvent(sequelize), GameVersion: defineGameVersion(sequelize),
  GameSetting: defineGameSetting(sequelize), GameVisit: defineGameVisit(sequelize), LoginEvent: defineLoginEvent(sequelize),
})

export type Models = ReturnType<typeof defineAll>

const userAssociations = (m: Models) => {
  m.User.hasOne(m.VarkResult, { foreignKey: 'user_id', as: 'varkProfile' })
  m.User.hasMany(m.UserRiskProgress, { foreignKey: 'user_id', as: 'progress' })
  m.User.hasOne(m.UserProfile, { foreignKey: 'user_id', as: 'profile' })
  m.User.hasMany(m.TrainingSession, { foreignKey: 'instructor_id', as: 'sessions' })
  m.User.hasMany(m.SessionUser, { foreignKey: 'user_id', as: 'enrollments' })
  m.VarkResult.belongsTo(m.User, { foreignKey: 'user_id', as: 'user' })
  m.UserRiskProgress.belongsTo(m.User, { foreignKey: 'user_id' })
  m.UserProfile.belongsTo(m.User, { foreignKey: 'user_id', as: 'user' })
  m.SessionUser.belongsTo(m.User, { foreignKey: 'user_id', as: 'user' })
}

const placeAssociations = (m: Models) => {
  m.Organization.hasMany(m.UserProfile, { foreignKey: 'organization_id', as: 'members' })
  m.Location.hasMany(m.UserProfile, { foreignKey: 'location_id', as: 'residents' })
  m.UserProfile.belongsTo(m.Organization, { foreignKey: 'organization_id', as: 'organization' })
  m.UserProfile.belongsTo(m.Location, { foreignKey: 'location_id', as: 'location' })
  m.Level.hasMany(m.Risk, { foreignKey: 'level_id', as: 'risks' })
  m.Risk.belongsTo(m.Level, { foreignKey: 'level_id', as: 'level' })
  m.Risk.hasMany(m.UserRiskProgress, { foreignKey: 'risk_id', as: 'attempts' })
  m.UserRiskProgress.belongsTo(m.Risk, { foreignKey: 'risk_id', as: 'risk' })
}

const sessionAssociations = (m: Models) => {
  m.TrainingSession.hasMany(m.SessionUser, { foreignKey: 'session_id', as: 'participants' })
  m.TrainingSession.hasMany(m.UserRiskProgress, { foreignKey: 'session_id', as: 'progress' })
  m.TrainingSession.belongsTo(m.User, { foreignKey: 'instructor_id', as: 'instructor' })
  m.TrainingSession.belongsTo(m.Location, { foreignKey: 'location_id', as: 'location' })
  m.Location.hasMany(m.TrainingSession, { foreignKey: 'location_id', as: 'sessions' })
  m.SessionUser.belongsTo(m.TrainingSession, { foreignKey: 'session_id', as: 'session' })
  m.UserRiskProgress.belongsTo(m.TrainingSession, { foreignKey: 'session_id', as: 'session' })
}

// Telemetría: intentos por nivel y eventos dentro de cada intento
const telemetryAssociations = (m: Models) => {
  m.User.hasMany(m.LevelAttempt, { foreignKey: 'user_id', as: 'attempts' })
  m.LevelAttempt.belongsTo(m.User, { foreignKey: 'user_id', as: 'user' })
  m.Level.hasMany(m.LevelAttempt, { foreignKey: 'level_id', as: 'attempts' })
  m.LevelAttempt.belongsTo(m.Level, { foreignKey: 'level_id', as: 'level' })
  m.TrainingSession.hasMany(m.LevelAttempt, { foreignKey: 'session_id', as: 'attempts' })
  m.LevelAttempt.belongsTo(m.TrainingSession, { foreignKey: 'session_id', as: 'session' })
  m.LevelAttempt.hasMany(m.GameEvent, { foreignKey: 'attempt_id', as: 'events' })
  m.GameEvent.belongsTo(m.LevelAttempt, { foreignKey: 'attempt_id', as: 'attempt' })
  m.User.hasMany(m.GameEvent, { foreignKey: 'user_id', as: 'events' })
  m.GameEvent.belongsTo(m.User, { foreignKey: 'user_id', as: 'user' })
}

const attemptAssociations = (m: Models) => {
  m.LevelAttempt.hasMany(m.UserRiskProgress, { foreignKey: 'attempt_id', as: 'riskResults' })
  m.UserRiskProgress.belongsTo(m.LevelAttempt, { foreignKey: 'attempt_id', as: 'attempt' })
  // Despliegue del juego
  m.GameVersion.belongsTo(m.User, { foreignKey: 'uploaded_by', as: 'uploader', constraints: false })
}

/** Define los modelos y sus asociaciones sobre la instancia (una sola vez por instancia). */
export const defineModels = (sequelize: Sequelize): Models => {
  const models = defineAll(sequelize)
  ;[userAssociations, placeAssociations, sessionAssociations, telemetryAssociations, attemptAssociations].forEach((associate) => { associate(models) })
  return models
}
