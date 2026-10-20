import 'dotenv/config'
import { parseEnv } from './config/env'
import { start } from './legacy/server'

// Sin un secreto fuerte cualquiera podría firmar tokens válidos: no se arranca
const env = parseEnv(process.env)
if (!env.ok) {
  console.error(`❌ Configuración inválida:\n- ${env.error.join('\n- ')}`)
  process.exit(1)
}

void start()
