import 'dotenv/config'
import { parseEnv } from './config/env'

// Sin un secreto fuerte cualquiera podría firmar tokens válidos: no se arranca. Se valida ANTES de cargar la app,
// porque el composition root (container.ts) crea la conexión a la BD al importarse.
const env = parseEnv(process.env)
if (!env.ok) {
  console.error(`❌ Configuración inválida:\n- ${env.error.join('\n- ')}`)
  process.exit(1)
}

const boot = async (): Promise<void> => {
  const { start } = await import('./legacy/server.js')
  await start()
}

void boot()
