import { z } from 'zod'

// Variables del entorno, validadas al arrancar. Es el único lugar del código que lee process.env.

// Texto opcional: vacío cuenta como ausente (así las leía legacy con `||`)
const optionalText = z.string().optional().transform((v) => (v === '' ? undefined : v))

// Máximo por ventana de 15 min: ausente, inválido o 0 vuelve al valor por defecto (así lo leía legacy con `Number(x) || n`)
const maxPerWindow = (fallback: number) => z.coerce.number().int().positive().catch(fallback)

const rateLimits = {
  RATE_LIMIT_USER_MAX: maxPerWindow(1500),
  RATE_LIMIT_IP_MAX: maxPerWindow(3000),
  RATE_LIMIT_AUTH_MAX: maxPerWindow(300),
  RATE_LIMIT_LOGIN_CEDULA_MAX: maxPerWindow(10),
  RATE_LIMIT_LOGIN_IP_FAIL_MAX: maxPerWindow(60),
  RATE_LIMIT_JOIN_MAX: maxPerWindow(20),
}

// Varios orígenes separados por coma (panel, juego); sin definir o con '*', cualquiera ('*' dentro de una lista no
// es comodín para cors: se compararía literal)
const origins = optionalText.transform((v) => (v ?? '').split(',').map((o) => o.trim()).filter((o) => o !== '' && o !== '*'))

// Despliegue del juego: sin bucket de S3 o de R2, cada almacenamiento cae a disco (DEPLOY_LOCAL_DIR)
const deployment = {
  DEPLOY_MAX_MB: z.coerce.number().positive().catch(500),
  DEPLOY_LOCAL_DIR: optionalText.transform((v) => v ?? '.deploy'),
  PLAY_URL: optionalText.transform((v) => (v ?? 'https://play.earthcation.saimers.dev').replace(/\/+$/, '')),
  // Compartido con el Worker, que valida los enlaces de vista previa
  PLAY_SIGNING_SECRET: optionalText,
  AWS_S3_BUCKET: optionalText,
  AWS_REGION: optionalText.transform((v) => v ?? 'us-east-1'),
  AWS_ACCESS_KEY_ID: optionalText,
  AWS_SECRET_ACCESS_KEY: optionalText,
  R2_BUCKET: optionalText,
  R2_ACCOUNT_ID: optionalText,
  R2_ACCESS_KEY_ID: optionalText,
  R2_SECRET_ACCESS_KEY: optionalText,
}

const schema = z.object({
  ...deployment,
  ...rateLimits,
  ALLOWED_ORIGINS: origins,
  // Lecturas acotadas: el instructor solo lee a los jugadores de sus salas y el desarrollador no ve datos personales
  SCOPED_READS: z.enum(['true', 'false']).catch('true').transform((v) => v === 'true'),
  // Documentación de la API v1 (Swagger UI y OpenAPI): pública o solo para admin y desarrollador con token
  DOCS_ACCESS: z.enum(['public', 'staff']).catch('public'),
  // Sal de las huellas de IP del registro de auditoría; sin ella se deriva del JWT_SECRET
  AUDIT_IP_SALT: optionalText,
  JWT_SECRET: z.string({ error: 'falta' }).min(32, 'debe tener al menos 32 caracteres'),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.string().default('development'),
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().optional(),
  DB_USER: z.string().optional(),
  DB_PASS: z.string().optional(),
  // Certificado de la CA del servidor de BD (PEM; los saltos de línea pueden ir como \n). Con él la conexión TLS verifica
  // el certificado; sin él se cifra pero no se verifica el servidor.
  DB_SSL_CA: optionalText,
  // Sequelize abre 5 conexiones por defecto; con ~50 jugadores escribiendo a la vez hacían cola
  DB_POOL_MAX: z.coerce.number().int().positive().default(20),
  DB_POOL_MIN: z.coerce.number().int().nonnegative().default(2),
  // Sin REDIS_URL la caché y los límites de peticiones viven en memoria
  REDIS_URL: z.string().optional(),
  // Compartido con el Worker de Cloudflare: sin él, POST /api/visits/ingest responde 401 siempre
  VISITS_INGEST_SECRET: z.string().optional(),
  // Token del CI del juego (cabecera x-deploy-token): solo crea, sube y completa versiones; activar sigue siendo de una
  // persona. Sin él nadie entra por esa vía.
  DEPLOY_UPLOAD_TOKEN: z.string().min(32, 'DEPLOY_UPLOAD_TOKEN debe tener al menos 32 caracteres').optional(),
  // Valor de x-earthcation-edge que agrega la Transform Rule de Cloudflare (ver rest-api middlewares/cloudflare.ts)
  CF_EDGE_SECRET: z.string().optional(),
  // Correo (Resend): sin clave la API arranca, pero los envíos fallan (el alta de staff responde email_sent: false)
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('noreply@saimers.dev'),
  // Panel web: base del enlace para definir o restablecer la contraseña
  FRONTEND_URL: z.string().optional(),
})

export type Env = z.infer<typeof schema>

// CORS: en producción nunca "cualquiera". Sin lista (o con "*") solo se aceptan el panel y el juego, que salen de
// FRONTEND_URL y PLAY_URL; fuera de producción sin lista se acepta cualquiera para desarrollar.
const originOf = (url: string | undefined): string[] => {
  try {
    return url ? [new URL(url).origin] : []
  } catch {
    return []
  }
}

export const allowedOrigins = (e: Env): readonly string[] =>
  (e.ALLOWED_ORIGINS.length > 0 || e.NODE_ENV !== 'production' ? e.ALLOWED_ORIGINS : [...originOf(e.FRONTEND_URL), ...originOf(e.PLAY_URL)])

const describe = (issue: z.core.$ZodIssue): string => `${issue.path.join('.')}: ${issue.message}`

/** Falta una variable obligatoria o tiene un valor inválido: la API no arranca. */
export class InvalidEnvError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Configuración inválida: ${problems.join('; ')}`)
    this.name = 'InvalidEnvError'
  }
}

/** El entorno validado y con sus valores por defecto; lanza InvalidEnvError con todos los problemas juntos. */
export const parseEnv = (source: NodeJS.ProcessEnv = process.env): Env => {
  const parsed = schema.safeParse(source)
  if (!parsed.success) throw new InvalidEnvError(parsed.error.issues.map(describe))
  return parsed.data
}
