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
