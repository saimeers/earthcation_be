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
  /** CA del servidor (PEM): con ella se verifica el certificado; sin ella solo se cifra. */
  readonly sslCa?: string
  readonly poolMax: number
  readonly poolMin: number
}

// TLS: con la CA del servidor se verifica su certificado; sin ella (Railway entrega uno propio) se cifra sin verificar
const dialectOptions = (c: DatabaseConfig) => {
  if (!c.ssl) return {}
  return { ssl: c.sslCa ? { require: true, ca: c.sslCa, rejectUnauthorized: true } : { require: true, rejectUnauthorized: false } }
}

// Por defecto Sequelize abre máx. 5 conexiones: con ~50 jugadores escribiendo a la vez las peticiones hacían cola.
// Railway Postgres admite ~100; se deja margen para otras réplicas.
export const createSequelize = (c: DatabaseConfig): Sequelize => new Sequelize(c.name ?? '', c.user ?? '', c.password, {
  host: c.host,
  port: c.port,
  dialect: 'postgres',
  dialectOptions: dialectOptions(c),
  logging: false,
  pool: { max: c.poolMax, min: c.poolMin, idle: 10000, acquire: 30000 },
})
