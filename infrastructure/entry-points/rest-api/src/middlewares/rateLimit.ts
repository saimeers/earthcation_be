import { createHash } from 'node:crypto'
import type { Request, RequestHandler } from 'express'
import { ipKeyGenerator, rateLimit, type ClientRateLimitInfo, type Options, type Store } from 'express-rate-limit'
import type { TokenVerifier } from '@earthcation/model'

/** Contador por ventana fija compartido entre instancias (lo implementa @earthcation/redis-cache). */
export interface WindowCounter {
  hit(key: string, windowMs: number): Promise<{ readonly hits: number, readonly resetAt: Date }>
  decrement(key: string): Promise<void>
  reset(key: string): Promise<void>
}

/** Máximos por ventana de 15 minutos. */
export interface RateLimits {
  /** Global, peticiones con token (por usuario). */
  readonly userMax: number
  /** Global, peticiones anónimas (por IP). */
  readonly ipMax: number
  /** Login y recuperación de contraseña (por usuario o IP). */
  readonly authMax: number
  /** Logins fallidos con una misma cédula. */
  readonly loginCedulaMax: number
  /** Logins fallidos con cédulas no registradas desde una misma IP. */
  readonly loginIpFailMax: number
}

export interface RateLimitDeps {
  readonly limits: RateLimits
  readonly tokens: TokenVerifier
  /** IP del visitante (detrás de Cloudflare, la de CF-Connecting-IP). */
  readonly clientIp: (req: Request) => string | undefined
  readonly cedulaExists: (cedula: string) => Promise<boolean>
  /** Contadores compartidos por prefijo (Redis); sin ellos, cada limitador cuenta en memoria. */
  readonly counters?: (prefix: string) => WindowCounter
}

export interface RateLimiters {
  readonly global: RequestHandler
  readonly auth: RequestHandler
  readonly loginCedula: RequestHandler
  readonly loginIpFail: RequestHandler
}

const WINDOW_MS = 15 * 60 * 1000
const TOO_MANY = { error: 'Demasiadas peticiones, intenta de nuevo en unos minutos.' }

/** Adapta un WindowCounter al Store de express-rate-limit. */
class CounterStore implements Store {
  private windowMs = WINDOW_MS

  constructor(private readonly counter: WindowCounter) {}

  init(options: Options): void { this.windowMs = options.windowMs }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const { hits, resetAt } = await this.counter.hit(key, this.windowMs)
    return { totalHits: hits, resetTime: resetAt }
  }

  decrement(key: string): Promise<void> { return this.counter.decrement(key) }

  resetKey(key: string): Promise<void> { return this.counter.reset(key) }
}

// Usuario del token, sin fallar si no hay o es inválido: eso lo decide `authenticate` después
const userIdOf = (tokens: TokenVerifier) => (req: Request): string | null => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return null
  try {
    return tokens.verify(token).id
  } catch {
    return null
  }
}

const cedulaOf = (req: Request): string => {
  const cedula = (req.body as { cedula?: unknown } | undefined)?.cedula
  return typeof cedula === 'string' || typeof cedula === 'number' ? String(cedula) : ''
}

const ipKey = (deps: RateLimitDeps, req: Request): string => `ip:${ipKeyGenerator(deps.clientIp(req) ?? '')}`

type LimiterOptions = Partial<Options> & { readonly limit: number, readonly anonymousMax?: number }

/**
 * Un salón entero comparte una IP pública (50 jugadores ≈ 11 000 peticiones cada 15 min): las peticiones con token
 * se cuentan por usuario y solo las anónimas por IP. Si el almacén de contadores falla, deja pasar.
 */
const limiter = (deps: RateLimitDeps, prefix: string, { limit, anonymousMax, ...options }: LimiterOptions): RequestHandler => {
  const userId = userIdOf(deps.tokens)
  return rateLimit({
    windowMs: WINDOW_MS, standardHeaders: true, legacyHeaders: false, passOnStoreError: true, message: TOO_MANY,
    keyGenerator: (req) => { const id = userId(req); return id ? `u:${id}` : ipKey(deps, req) },
    limit: (req) => (userId(req) ? limit : (anonymousMax ?? limit)),
    ...(deps.counters && { store: new CounterStore(deps.counters(prefix)) }),
    ...options,
  })
}

// Por cédula: frena que alguien pruebe muchas veces una misma cuenta. Solo cuentan los fallidos, así 50 jugadores
// que entran bien desde la IP del salón no se bloquean.
const loginCedulaLimiter = (deps: RateLimitDeps): RequestHandler => limiter(deps, 'rl:login-cedula:', {
  limit: deps.limits.loginCedulaMax,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `c:${createHash('sha256').update(cedulaOf(req)).digest('hex')}`,
  message: { error: 'Demasiados intentos con esa cédula, intenta de nuevo en unos minutos.' },
})

// Por IP: frena que desde un mismo lugar se prueben muchas cédulas que no existen. Las registradas no cuentan: si
// no, los errores de tipeo de un salón entero (todos con la misma IP) dejarían sin entrar a quienes escriben bien.
const loginIpFailLimiter = (deps: RateLimitDeps): RequestHandler => limiter(deps, 'rl:login-ip:', {
  limit: deps.limits.loginIpFailMax,
  skip: async (req) => { const cedula = cedulaOf(req).trim(); return cedula !== '' && deps.cedulaExists(cedula) },
  keyGenerator: (req) => ipKey(deps, req),
  message: { error: 'Demasiados intentos fallidos desde esta red, intenta de nuevo en unos minutos.' },
})

/** Los límites de peticiones de la API v1. */
export const rateLimiters = (deps: RateLimitDeps): RateLimiters => ({
  global: limiter(deps, 'rl:global:', { limit: deps.limits.userMax, anonymousMax: deps.limits.ipMax }),
  auth: limiter(deps, 'rl:auth:', { limit: deps.limits.authMax }),
  loginCedula: loginCedulaLimiter(deps),
  loginIpFail: loginIpFailLimiter(deps),
})
