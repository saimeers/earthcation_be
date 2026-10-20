import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Request, RequestHandler } from 'express'
import {
  randomIds, systemClock, type RuntimeInfo,
  IdentifierAvailability, PlaceMatcher, ResetTokenFactory, type LoginRecorder as LoginRecorderPort,
} from '@earthcation/model'
import {
  ChangeLocationStatusUseCase, ChangeOrganizationStatusUseCase, CreateLocationUseCase, CreateOrganizationUseCase,
  GetLocationUseCase, GetOrganizationUseCase, ListLocationsUseCase, ListOrganizationsUseCase, ListOrganizationTypesUseCase,
  SearchLocationsUseCase, SearchOrganizationsUseCase, UpdateLocationUseCase, UpdateOrganizationUseCase,
  GetMyVarkResultUseCase, ListVarkResultsByPlaceUseCase, ListVarkResultsByStyleUseCase, ListVarkResultsUseCase,
  SubmitVarkTestUseCase,
  GetHealthUseCase, GetVisitStatsUseCase, IngestVisitUseCase, RecordLoginUseCase,
  ActivateVersionUseCase, CompleteUploadUseCase, CreateVersionUseCase, GetDeployStatusUseCase, GetPlayFileUseCase,
  GetPreviewUrlUseCase, ListVersionsUseCase, PublishVersionUseCase, ReceiveLocalZipUseCase,
  RecoverInterruptedPublishesUseCase, RemoveVersionUseCase,
  ChangeUserStatusUseCase, ConfirmBulkImportUseCase, CreateUserUseCase, GetUserSessionsUseCase, GetUserUseCase,
  ListUsersUseCase, LoginUseCase, PreviewBulkImportUseCase, RequestPasswordResetUseCase, ResetPasswordUseCase,
  UpdateUserUseCase,
} from '@earthcation/usecase'
import {
  createSequelize, defineModels, SequelizeLocationRepository, SequelizeOrganizationRepository, SequelizeVarkRepository,
  SequelizeHealthProbe, SequelizeLoginEventRepository, SequelizeVisitRepository, SequelizeVisitStatsReadModel,
  SequelizeGameVersionRepository,
  SequelizeImportDirectory, SequelizeUserReadModel, SequelizeUserRepository,
} from '@earthcation/sequelize-repository'
import { createDeploymentStorages } from '@earthcation/object-storage'
import { AdmZipReader } from '@earthcation/zip-reader'
import { HmacPreviewSigner } from '@earthcation/hmac-signer'
import { InProcessPublishQueue } from '@earthcation/in-process-queue'
import { createRedisClient, RedisCache } from '@earthcation/redis-cache'
import { InMemoryMetricsStore } from '@earthcation/in-memory-metrics'
import { BcryptPasswordHasher, JwtTokenService, RandomPasswordGenerator, Sha256ResetTokenService } from '@earthcation/security'
import { ResendMailer } from '@earthcation/resend-mailer'
import { XlsxSpreadsheetReader } from '@earthcation/excel'
import { JsonPlaceCatalog } from '@earthcation/geo-catalog'
import {
  authenticate, locationRoutesV1, organizationRoutesV1, varkRoutesV1,
  cloudflareEdge, deployRoutesV1, healthRoutesV1, loginRecorder, metrics, playLocalRoutes, publicHealthV1, visitRoutesV1,
  type LoginRecorder,
  authRoutesV1, bulkImportRoutesV1, userRoutesV1,
} from '@earthcation/rest-api'
import { loadEnv, type Env } from './config/env'

// Composition root (inyección manual): instancia los adaptadores, se los pasa a los casos de uso y arma las rutas.
// src/legacy toma de aquí la conexión y los modelos mientras sus contextos se migran.

export const env = loadEnv()

const databaseConfig = (e: Env) => ({
  host: e.DB_HOST, port: e.DB_PORT, name: e.DB_NAME, user: e.DB_USER, password: e.DB_PASS,
  ssl: e.NODE_ENV === 'production', poolMax: e.DB_POOL_MAX, poolMin: e.DB_POOL_MIN,
})

export const sequelize = createSequelize(databaseConfig(env))
export const models = defineModels(sequelize)

// ── Seguridad ────────────────────────────────────────────────────────────────

// legacy/utils/jwt.utils y hash.utils reexportan estas instancias para el código v1, la semilla y scripts/load
export const security = {
  tokens: new JwtTokenService(env.JWT_SECRET),
  passwords: new BcryptPasswordHasher(),
}

const auth: RequestHandler = authenticate(security.tokens)

// ── Catálogo ─────────────────────────────────────────────────────────────────

const organizationRepository = new SequelizeOrganizationRepository(models)
const locationRepository = new SequelizeLocationRepository(models)

const catalog = {
  authenticate: auth,
  organizations: {
    list: new ListOrganizationsUseCase(organizationRepository),
    search: new SearchOrganizationsUseCase(organizationRepository),
    types: new ListOrganizationTypesUseCase(organizationRepository),
    get: new GetOrganizationUseCase(organizationRepository),
    create: new CreateOrganizationUseCase(organizationRepository),
    update: new UpdateOrganizationUseCase(organizationRepository),
    changeStatus: new ChangeOrganizationStatusUseCase(organizationRepository),
  },
  locations: {
    list: new ListLocationsUseCase(locationRepository),
    search: new SearchLocationsUseCase(locationRepository),
    get: new GetLocationUseCase(locationRepository),
    create: new CreateLocationUseCase(locationRepository),
    update: new UpdateLocationUseCase(locationRepository),
    changeStatus: new ChangeLocationStatusUseCase(locationRepository),
  },
}

// ── VARK ─────────────────────────────────────────────────────────────────────

const varkRepository = new SequelizeVarkRepository(models)

const vark = {
  authenticate: auth,
  vark: {
    submit: new SubmitVarkTestUseCase(varkRepository),
    mine: new GetMyVarkResultUseCase(varkRepository),
    list: new ListVarkResultsUseCase(varkRepository),
    listByStyle: new ListVarkResultsByStyleUseCase(varkRepository),
    listByPlace: new ListVarkResultsByPlaceUseCase(varkRepository),
  },
}

// ── Despliegue del juego ─────────────────────────────────────────────────────

const storages = createDeploymentStorages({
  localDir: env.DEPLOY_LOCAL_DIR,
  s3: env.AWS_S3_BUCKET === undefined ? undefined : {
    bucket: env.AWS_S3_BUCKET, region: env.AWS_REGION,
    accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
  r2: env.R2_BUCKET === undefined ? undefined : {
    bucket: env.R2_BUCKET, accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
})

const gameVersions = new SequelizeGameVersionRepository(sequelize, models)
const deploySettings = { maxMb: env.DEPLOY_MAX_MB, playUrl: env.PLAY_URL }
const localPublishing = storages.published.kind === 'local'
// Sin R2 la vista previa la sirve la propia API (/play-local), que no valida el token: basta un secreto fijo
const signer = new HmacPreviewSigner(env.PLAY_SIGNING_SECRET ?? (localPublishing ? 'local-dev' : undefined))

// La cola corre publish-version; complete-upload solo encola
const publishVersion = new PublishVersionUseCase({
  versions: gameVersions, ...storages, zips: new AdmZipReader(), clock: systemClock,
  log: { info: (m) => { console.log(m) }, error: (m) => { console.error(m) } },
})
const publishQueue = new InProcessPublishQueue((id) => publishVersion.execute(id))

const deploymentUseCases = {
  status: new GetDeployStatusUseCase({ versions: gameVersions, ...storages, settings: deploySettings }),
  list: new ListVersionsUseCase(gameVersions),
  create: new CreateVersionUseCase({ versions: gameVersions, originals: storages.originals, ids: randomIds, settings: deploySettings }),
  receiveZip: new ReceiveLocalZipUseCase({ versions: gameVersions, originals: storages.originals }),
  complete: new CompleteUploadUseCase({ versions: gameVersions, originals: storages.originals, queue: publishQueue }),
  activate: new ActivateVersionUseCase({ versions: gameVersions, published: storages.published, clock: systemClock }),
  remove: new RemoveVersionUseCase({ versions: gameVersions, ...storages }),
  preview: new GetPreviewUrlUseCase({
    versions: gameVersions, published: storages.published, signer, clock: systemClock, settings: deploySettings,
  }),
}

/** Lo que legacy/server.js y legacy/app.js usan del despliegue. */
export const deployment = {
  /** Sin R2 (desarrollo) la API sirve el juego publicado en /play-local, montado antes de helmet. */
  localPublishing,
  /** Al arrancar: las publicaciones cortadas por el reinicio quedan fallidas. */
  recoverInterrupted: () => new RecoverInterruptedPublishesUseCase(gameVersions).execute(),
}

// ── Observabilidad ───────────────────────────────────────────────────────────

const log = (message: string): void => { console.error(message) }

/** Cliente de Redis (o null): lo comparten la caché y el limitador de peticiones (legacy/config/redis.js). */
export const redis = createRedisClient(env.REDIS_URL, log)
/** Caché de lecturas de todos los contextos (legacy/services/cache.service.js la re-exporta). */
export const cache = new RedisCache(redis)
/** Visitante detrás de Cloudflare (legacy/utils/clientIp.js lo re-exporta para el limitador). */
export const edge = cloudflareEdge(env.CF_EDGE_SECRET)

const metricsStore = new InMemoryMetricsStore()

// Versión del desplegable: package.json de app-service (src/ y dist/ están a la misma altura)
const { version } = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as { version: string }

const runtime: RuntimeInfo = {
  version,
  uptimeSeconds: () => Math.round(process.uptime()),
  memoryMb: () => Math.round(process.memoryUsage().rss / 1048576),
}

const observability = {
  authenticate: auth,
  ingestSecret: env.VISITS_INGEST_SECRET,
  visits: {
    ingest: new IngestVisitUseCase({ visits: new SequelizeVisitRepository(models), cache }),
    stats: new GetVisitStatsUseCase({ stats: new SequelizeVisitStatsReadModel(models), cache, clock: systemClock }),
  },
  health: new GetHealthUseCase({
    database: new SequelizeHealthProbe(sequelize), cache, metrics: metricsStore, runtime, clock: systemClock,
  }),
}

/** Mide cada petición para /api/health/details (va al principio de la app). */
export const metricsMiddleware = metrics(metricsStore)

/** Ubicación del inicio de sesión (desde la IP y las cabeceras cf-*); lo usa el login de identidad. */
const recordLogin: LoginRecorder = loginRecorder({
  recordLogin: new RecordLoginUseCase(new SequelizeLoginEventRepository(models)),
  fromCloudflare: edge.fromCloudflare,
  log,
})

// ── Identidad ────────────────────────────────────────────────────────────────

const userRepository = new SequelizeUserRepository(sequelize, models)
const userReadModel = new SequelizeUserReadModel(models)
const availability = new IdentifierAvailability(userRepository)
const resetTokens = new ResetTokenFactory(new Sha256ResetTokenService(), systemClock)
const passwordGenerator = new RandomPasswordGenerator()
const mailer = new ResendMailer({ apiKey: env.RESEND_API_KEY, frontendUrl: env.FRONTEND_URL, from: env.EMAIL_FROM })

// El login entrega el origen (IP y cabeceras) y observabilidad decide si cree las cabeceras de Cloudflare; su
// recorder solo lee req.ip y req.headers
const logins: LoginRecorderPort = {
  record: (login) => {
    const req = { ip: login.origin.ip, headers: login.origin.headers } as unknown as Request
    recordLogin(req, { id: login.userId, role: login.role })
  },
}

const identity = {
  authenticate: auth,
  auth: {
    login: new LoginUseCase({ users: userRepository, profiles: userReadModel, passwords: security.passwords, tokens: security.tokens, logins }),
    requestPasswordReset: new RequestPasswordResetUseCase({ users: userRepository, resetTokens, mailer }),
    resetPassword: new ResetPasswordUseCase({ users: userRepository, resetTokens, passwords: security.passwords, clock: systemClock }),
  },
  users: {
    list: new ListUsersUseCase(userReadModel),
    get: new GetUserUseCase(userReadModel),
    sessions: new GetUserSessionsUseCase(userReadModel),
    create: new CreateUserUseCase({
      users: userRepository, availability, passwords: security.passwords, generator: passwordGenerator, resetTokens, mailer,
      errors: { report: (message) => { console.error(message) } },
    }),
    update: new UpdateUserUseCase({ users: userRepository, availability, readModel: userReadModel }),
    changeStatus: new ChangeUserStatusUseCase(userRepository),
  },
  bulkImport: {
    preview: new PreviewBulkImportUseCase({ spreadsheets: new XlsxSpreadsheetReader(), users: userRepository }),
    confirm: new ConfirmBulkImportUseCase({
      users: userRepository, directory: new SequelizeImportDirectory(models), places: new PlaceMatcher(new JsonPlaceCatalog()),
      passwords: security.passwords, generator: passwordGenerator,
    }),
  },
}

export const routes = {
  organizations: organizationRoutesV1(catalog),
  locations: locationRoutesV1(catalog),
  vark: varkRoutesV1(vark),
  deploy: deployRoutesV1({ authenticate: auth, deployment: deploymentUseCases, maxUploadMb: env.DEPLOY_MAX_MB }),
  playLocal: playLocalRoutes(new GetPlayFileUseCase(storages.published)),
  visits: visitRoutesV1(observability),
  health: healthRoutesV1(observability),
  publicHealth: publicHealthV1(observability),
  auth: authRoutesV1(identity),
  users: userRoutesV1(identity),
  bulkImport: bulkImportRoutesV1(identity),
}
