import 'dotenv/config'
import { InvalidEnvError, parseEnv } from './config/env'

// Sin un secreto fuerte cualquiera podría firmar tokens válidos: no se arranca. Se valida ANTES de cargar la app,
// porque el composition root (container.ts) crea la conexión a la BD al importarse.
try {
  parseEnv(process.env)
} catch (error) {
  if (!(error instanceof InvalidEnvError)) throw error
  console.error(`❌ Configuración inválida:\n- ${error.problems.join('\n- ')}`)
  process.exit(1)
}

const boot = async (): Promise<void> => {
  const { start } = await import('./boot.js')
  await start()
}

void boot()
