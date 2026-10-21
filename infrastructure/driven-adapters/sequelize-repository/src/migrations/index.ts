import type { Sequelize } from 'sequelize'
import { SequelizeStorage, Umzug, type MigrationParams } from 'umzug'
import * as baseline from './0001_baseline'
import * as auditLogs from './0002_audit_logs'
import * as idempotencyKeys from './0003_idempotency_keys'

interface Migration {
  readonly name: string
  readonly up: (params: MigrationParams<Sequelize>) => Promise<void>
}

// Lista explícita (no un glob): funciona igual desde src/ con tsx y desde dist/ compilado.
// Las migraciones aplicadas quedan en la tabla `schema_migrations`.
const MIGRATIONS: readonly Migration[] = [baseline, auditLogs, idempotencyKeys]

const quiet = { info: () => undefined, warn: console.warn, error: console.error, debug: () => undefined }

/** Aplica las migraciones pendientes y devuelve sus nombres (vacío si la BD ya estaba al día). */
export const migrate = async (sequelize: Sequelize): Promise<readonly string[]> => {
  const umzug = new Umzug({
    migrations: MIGRATIONS.map((m) => ({ name: m.name, up: m.up })),
    context: sequelize,
    storage: new SequelizeStorage({ sequelize, tableName: 'schema_migrations' }),
    logger: quiet,
  })
  return (await umzug.up()).map((m) => m.name)
}
