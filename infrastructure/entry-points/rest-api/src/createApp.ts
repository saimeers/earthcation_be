import express, { type Express, type RequestHandler } from 'express'
import compression from 'compression'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { errorHandlerV1, notFoundV1 } from './middlewares/errorHandler'
import type { RateLimiters } from './middlewares/rateLimit'

/** Routers y handlers de la v1, ya armados con sus casos de uso por el composition root. */
export interface AppRoutesV1 {
  readonly publicHealth: RequestHandler
  readonly playLocal: RequestHandler
  readonly visits: RequestHandler
  readonly auth: RequestHandler
  readonly users: RequestHandler
  readonly bulkImport: RequestHandler
  readonly locations: RequestHandler
  readonly organizations: RequestHandler
  readonly vark: RequestHandler
  readonly health: RequestHandler
  readonly deploy: RequestHandler
  readonly progress: RequestHandler
  readonly levels: RequestHandler
  readonly analytics: RequestHandler
  readonly telemetry: RequestHandler
  readonly sessions: RequestHandler
}

export interface AppDeps {
  readonly routes: AppRoutesV1
  readonly limiters: RateLimiters
  /** Mide cada petición (va al principio). */
  readonly metrics: RequestHandler
  /** Orígenes permitidos por CORS; vacío = cualquiera. */
  readonly allowedOrigins: readonly string[]
  /** Sin R2 (desarrollo) la API sirve el juego publicado en /play-local, como lo haría el Worker. */
  readonly servePlayLocal: boolean
  /** Formato del log de peticiones de morgan; sin él (pruebas) no se registra. */
  readonly requestLog?: 'dev' | 'tiny'
  readonly log: (message: string) => void
}

// Va antes de helmet: su CSP bloquea el wasm y los workers de Unity
const mountPlayLocal = (app: Express, deps: AppDeps): void => {
  if (deps.servePlayLocal) app.use('/play-local', deps.routes.playLocal)
}

const mountCommon = (app: Express, deps: AppDeps): void => {
  app.use(helmet())
  app.use(cors({ origin: deps.allowedOrigins.length > 0 ? [...deps.allowedOrigins] : '*' }))
  app.use(compression())
  app.use(express.json({ limit: '1mb' }))
  if (deps.requestLog) app.use(morgan(deps.requestLog))
  app.use(deps.metrics)
}

// Estado público mínimo y visitas van antes del límite global: las visitas llegan todas desde las IP del Worker
const mountUnlimited = (app: Express, { routes }: AppDeps): void => {
  app.get('/api/health', routes.publicHealth)
  app.use('/api/visits', routes.visits)
}

const mountLimits = (app: Express, { limiters }: AppDeps): void => {
  app.use('/api', limiters.global)
  app.use('/api/auth/login', limiters.auth, limiters.loginIpFail, limiters.loginCedula)
  app.use('/api/auth/forgot-password', limiters.auth)
}

const mountIdentityAndCatalog = (app: Express, { routes }: AppDeps): void => {
  app.use('/api/auth', routes.auth)
  app.use('/api/users', routes.users)
  app.use('/api/users/bulk-import', routes.bulkImport)
  app.use('/api/locations', routes.locations)
  app.use('/api/organizations', routes.organizations)
  app.use('/api/vark', routes.vark)
}

const mountOperationAndLearning = (app: Express, { routes }: AppDeps): void => {
  app.use('/api/health', routes.health)
  app.use('/api/deploy', routes.deploy)
  app.use('/api/progress', routes.progress)
  app.use('/api/levels', routes.levels)
  app.use('/api/analytics', routes.analytics)
  app.use('/api/telemetry', routes.telemetry)
  app.use('/api/sessions', routes.sessions)
}

const mountFallbacks = (app: Express, deps: AppDeps): void => {
  app.get('/health', (_req, res) => { res.json({ status: 'ok', timestamp: new Date() }) })
  app.get('/', (_req, res) => { res.send('API funcionando 🚀') })
  // Un único errorHandler traduce los errores de dominio y los de Express a la respuesta de v1
  app.use(notFoundV1)
  app.use(errorHandlerV1(deps.log))
}

/** La app Express completa sin arrancar el servidor (la usan main y las pruebas con supertest). */
export const createApp = (deps: AppDeps): Express => {
  const app = express()
  // Detrás del proxy de Cloudflare/Railway: req.ip es el del proxy (el visitante sale de CF-Connecting-IP)
  app.set('trust proxy', 1)
  for (const mount of [mountPlayLocal, mountCommon, mountUnlimited, mountLimits, mountIdentityAndCatalog, mountOperationAndLearning, mountFallbacks]) {
    mount(app, deps)
  }
  return app
}
