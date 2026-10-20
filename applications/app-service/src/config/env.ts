import { z } from 'zod'
import { err, ok, type Result } from '../legacy/shared/result'

// Variables del entorno, validadas al arrancar. Es el único lugar del código nuevo que lee process.env (src/legacy
// todavía lee algunas por su cuenta hasta migrar su contexto).
const schema = z.object({
  JWT_SECRET: z.string({ error: 'falta' }).min(32, 'debe tener al menos 32 caracteres'),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.string().default('development'),
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().optional(),
  DB_USER: z.string().optional(),
  DB_PASS: z.string().optional(),
  // Sequelize abre 5 conexiones por defecto; con ~50 jugadores escribiendo a la vez hacían cola
  DB_POOL_MAX: z.coerce.number().int().positive().default(20),
  DB_POOL_MIN: z.coerce.number().int().nonnegative().default(2),
  // Sin REDIS_URL la caché y los límites de peticiones viven en memoria
  REDIS_URL: z.string().optional(),
  // Compartido con el Worker de Cloudflare: sin él, POST /api/visits/ingest responde 401 siempre
  VISITS_INGEST_SECRET: z.string().optional(),
  // Valor de x-earthcation-edge que agrega la Transform Rule de Cloudflare (ver rest-api middlewares/cloudflare.ts)
  CF_EDGE_SECRET: z.string().optional(),
})

export type Env = z.infer<typeof schema>

const describe = (issue: z.core.$ZodIssue): string => `${issue.path.join('.')}: ${issue.message}`

export const parseEnv = (source: NodeJS.ProcessEnv): Result<Env, readonly string[]> => {
  const parsed = schema.safeParse(source)
  return parsed.success ? ok(parsed.data) : err(parsed.error.issues.map(describe))
}

/** El entorno ya validado (main.ts sale con un mensaje claro antes de llegar aquí si falta algo). */
export const loadEnv = (source: NodeJS.ProcessEnv = process.env): Env => {
  const parsed = parseEnv(source)
  if (!parsed.ok) throw new Error(`Configuración inválida: ${parsed.error.join('; ')}`)
  return parsed.value
}
