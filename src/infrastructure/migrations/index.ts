import type { Sequelize } from 'sequelize'
import { SequelizeStorage, Umzug, type MigrationParams } from 'umzug'
import * as baseline from './0001_baseline'

type Migration = {
  readonly name: string
  readonly up: (params: MigrationParams<Sequelize>) => Promise<void>
}

// Lista explícita (no un glob): así funciona igual desde src/ con tsx y desde dist/ compilado.
// Las migraciones aplicadas quedan en la tabla `schema_migrations`.
const MIGRATIONS: readonly Migration[] = [baseline]

const makeMigrator = (sequelize: Sequelize, logger: Pick<Console, 'info' | 'warn' | 'error' | 'debug'>) =>
  new Umzug({
    migrations: MIGRATIONS.map((m) => ({ name: m.name, up: m.up })),
    context: sequelize,
    storage: new SequelizeStorage({ sequelize, tableName: 'schema_migrations' }),
    logger,
  })

const quiet = { info: () => undefined, warn: console.warn, error: console.error, debug: () => undefined }

// Aplica las pendientes y devuelve sus nombres (vacío si la BD ya estaba al día)
export const migrate = async (sequelize: Sequelize): Promise<readonly string[]> => {
  const applied = await makeMigrator(sequelize, quiet).up()
  return applied.map((m) => m.name)
}
