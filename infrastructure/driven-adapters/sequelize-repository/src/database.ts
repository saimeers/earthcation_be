import { Sequelize } from 'sequelize'

/** Conexión a Postgres; los valores los lee y valida app-service (config/env.ts), nunca este paquete. */
export interface DatabaseConfig {
  readonly host?: string
  readonly port: number
  readonly name?: string
  readonly user?: string
  readonly password?: string
  /** En producción (Railway) la conexión va por TLS. */
  readonly ssl: boolean
  readonly poolMax: number
  readonly poolMin: number
}

// Por defecto Sequelize abre máx. 5 conexiones: con ~50 jugadores escribiendo a la vez las peticiones hacían cola.
// Railway Postgres admite ~100; se deja margen para otras réplicas.
export const createSequelize = (c: DatabaseConfig): Sequelize => new Sequelize(c.name ?? '', c.user ?? '', c.password, {
  host: c.host,
  port: c.port,
  dialect: 'postgres',
  dialectOptions: c.ssl ? { ssl: { require: true, rejectUnauthorized: false } } : {},
  logging: false,
  pool: { max: c.poolMax, min: c.poolMin, idle: 10000, acquire: 30000 },
})
