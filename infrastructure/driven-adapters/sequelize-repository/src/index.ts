// API pública del adaptador de persistencia (Postgres con Sequelize)
export { createSequelize, type DatabaseConfig } from './database'
export { defineModels, type Models } from './models'
export { migrate } from './migrations'
export { SequelizeOrganizationRepository } from './catalog/SequelizeOrganizationRepository'
export { SequelizeLocationRepository } from './catalog/SequelizeLocationRepository'

// ── vark ──
export { SequelizeVarkRepository } from './vark/SequelizeVarkRepository'

// ── observability ──
export { SequelizeVisitRepository } from './observability/SequelizeVisitRepository'
export { SequelizeLoginEventRepository } from './observability/SequelizeLoginEventRepository'
export { SequelizeVisitStatsReadModel } from './observability/SequelizeVisitStatsReadModel'
export { SequelizeHealthProbe } from './observability/SequelizeHealthProbe'
