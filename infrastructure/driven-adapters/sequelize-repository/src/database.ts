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

// TLS: con la CA del servidor se verifica que su certificado venga de ella; sin CA solo se cifra, sin verificar nada.
// El certificado de Railway dice CN=localhost y el host real es otro, asi que el nombre no se comprueba: verificar la
// cadena ya descarta a un servidor que no tenga la clave de esa CA, que es de lo que protege aqui.
export const dialectOptions = (c: DatabaseConfig) => {
  if (!c.ssl) return {}
  if (!c.sslCa) return { ssl: { require: true, rejectUnauthorized: false } }
  return { ssl: { require: true, ca: c.sslCa, rejectUnauthorized: true, checkServerIdentity: () => undefined } }
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
