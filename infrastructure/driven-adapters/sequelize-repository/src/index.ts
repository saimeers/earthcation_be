// API pública del adaptador de persistencia (Postgres con Sequelize)
export { createSequelize, type DatabaseConfig } from './database'
export { defineModels, type Models } from './models'
export { migrate } from './migrations'
export { SequelizeOrganizationRepository } from './catalog/SequelizeOrganizationRepository'
export { SequelizeLocationRepository } from './catalog/SequelizeLocationRepository'

// ── vark ──
export { SequelizeVarkRepository } from './vark/SequelizeVarkRepository'

// ── deployment ──
export { SequelizeGameVersionRepository } from './deployment/SequelizeGameVersionRepository'

// ── observability ──
export { SequelizeVisitRepository } from './observability/SequelizeVisitRepository'
export { SequelizeLoginEventRepository } from './observability/SequelizeLoginEventRepository'
export { SequelizeVisitStatsReadModel } from './observability/SequelizeVisitStatsReadModel'
export { SequelizeHealthProbe } from './observability/SequelizeHealthProbe'

// ── identity ──
export { SequelizeUserRepository } from './identity/SequelizeUserRepository'
export { SequelizeUserReadModel } from './identity/SequelizeUserReadModel'
export { SequelizeAccountDirectory } from './identity/SequelizeAccountDirectory'
export { SequelizeImportDirectory } from './identity/SequelizeImportDirectory'

// ── learning ──
export { SequelizeLearningRepository } from './learning/SequelizeLearningRepository'
export { SequelizeLearningReadModel } from './learning/SequelizeLearningReadModel'
export { SequelizeAnalyticsReadModel } from './learning/SequelizeAnalyticsReadModel'
export { SequelizeFreePlaySessions } from './learning/SequelizeFreePlaySessions'

// ── sessions ──
export { SequelizeSessionRepository } from './sessions/SequelizeSessionRepository'
export { SequelizeSessionDetailReader } from './sessions/SequelizeSessionDetailReader'

// ── audit ──
export { SequelizeAuditLog } from './audit/SequelizeAuditLog'
