import { z } from 'zod'
import { err, ok, type Result } from '../shared/result'

// Variables que la API necesita para arrancar. Las opcionales (S3, R2, Redis, Resend...) las siguen leyendo
// sus adaptadores; se irán sumando aquí contexto por contexto.
const schema = z.object({
  JWT_SECRET: z.string({ error: 'falta' }).min(32, 'debe tener al menos 32 caracteres'),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.string().default('development'),
})

export type Env = z.infer<typeof schema>

const describe = (issue: z.core.$ZodIssue): string => `${issue.path.join('.')}: ${issue.message}`

export const parseEnv = (source: NodeJS.ProcessEnv): Result<Env, readonly string[]> => {
  const parsed = schema.safeParse(source)
  return parsed.success ? ok(parsed.data) : err(parsed.error.issues.map(describe))
}
