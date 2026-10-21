import { migrate } from '@earthcation/sequelize-repository'
import { app, bootTasks, env, sequelize } from './container'

/** Esquema y datos base que la API necesita antes de atender. La semilla de pruebas lo reutiliza sobre su BD. */
export const prepareDatabase = async (): Promise<void> => {
  await sequelize.authenticate()
  console.log('✅ Conexión a PostgreSQL exitosa.')
  // Esquema por migraciones versionadas (Umzug); no hay sync({ alter: true }) al arrancar
  const applied = await migrate(sequelize)
  console.log(applied.length > 0 ? `✅ Migraciones aplicadas: ${applied.join(', ')}` : '✅ Esquema al día.')
  await bootTasks.recoverInterruptedPublishes.execute()
  const created = await bootTasks.seedPlaceCatalog.execute()
  if (created > 0) console.log(`✅ Catálogo de municipios: ${created} filas nuevas sembradas.`)
}

/** Prepara la BD y escucha en PORT; si la BD no responde, sale con error. */
export const start = async (): Promise<void> => {
  try {
    await prepareDatabase()
  } catch (error) {
    console.error('❌ Error DB:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
  app.listen(env.PORT, () => { console.log(`🚀 Servidor en http://localhost:${env.PORT}`) })
}
