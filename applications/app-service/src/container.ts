import type { RequestHandler } from 'express'
import { InvalidTokenError, ROLES, type AuthenticatedUser, type Role, type TokenVerifier } from '@earthcation/model'
import {
  ChangeLocationStatusUseCase, ChangeOrganizationStatusUseCase, CreateLocationUseCase, CreateOrganizationUseCase,
  GetLocationUseCase, GetOrganizationUseCase, ListLocationsUseCase, ListOrganizationsUseCase, ListOrganizationTypesUseCase,
  SearchLocationsUseCase, SearchOrganizationsUseCase, UpdateLocationUseCase, UpdateOrganizationUseCase,
  GetMyVarkResultUseCase, ListVarkResultsByPlaceUseCase, ListVarkResultsByStyleUseCase, ListVarkResultsUseCase,
  SubmitVarkTestUseCase,
} from '@earthcation/usecase'
import {
  createSequelize, defineModels, SequelizeLocationRepository, SequelizeOrganizationRepository, SequelizeVarkRepository,
} from '@earthcation/sequelize-repository'
import { authenticate, locationRoutesV1, organizationRoutesV1, varkRoutesV1 } from '@earthcation/rest-api'
import {
  ActivateVersionUseCase, CompleteUploadUseCase, CreateVersionUseCase, GetDeployStatusUseCase, GetPlayFileUseCase,
  GetPreviewUrlUseCase, ListVersionsUseCase, PublishVersionUseCase, ReceiveLocalZipUseCase,
  RecoverInterruptedPublishesUseCase, RemoveVersionUseCase,
} from '@earthcation/usecase'
import { randomIds, systemClock } from '@earthcation/model'
import { SequelizeGameVersionRepository } from '@earthcation/sequelize-repository'
import { createDeploymentStorages } from '@earthcation/object-storage'
import { AdmZipReader } from '@earthcation/zip-reader'
import { HmacPreviewSigner } from '@earthcation/hmac-signer'
import { InProcessPublishQueue } from '@earthcation/in-process-queue'
import { deployRoutesV1, playLocalRoutes } from '@earthcation/rest-api'
import { loadEnv, type Env } from './config/env'
import jwt from './legacy/utils/jwt.utils'

// Composition root (inyección manual): instancia los adaptadores, se los pasa a los casos de uso y arma las rutas.
// src/legacy toma de aquí la conexión y los modelos mientras sus contextos se migran.

export const env = loadEnv()

const databaseConfig = (e: Env) => ({
  host: e.DB_HOST, port: e.DB_PORT, name: e.DB_NAME, user: e.DB_USER, password: e.DB_PASS,
  ssl: e.NODE_ENV === 'production', poolMax: e.DB_POOL_MAX, poolMin: e.DB_POOL_MIN,
})

export const sequelize = createSequelize(databaseConfig(env))
export const models = defineModels(sequelize)

// ── Seguridad (el adaptador propio llega con el contexto de identidad) ───────

const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v)

const toAuthenticatedUser = (claims: unknown): AuthenticatedUser => {
  const c = (claims ?? {}) as { id?: unknown; role?: unknown; username?: unknown }
  if (typeof c.id !== 'string' || !isRole(c.role)) throw new InvalidTokenError()
  return { id: c.id, role: c.role, username: typeof c.username === 'string' ? c.username : null }
}

const tokens: TokenVerifier = {
  verify: (token) => {
    try { return toAuthenticatedUser(jwt.verifyToken(token)) } catch { throw new InvalidTokenError() }
  },
}

const auth: RequestHandler = authenticate(tokens)

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

export const routes = {
  organizations: organizationRoutesV1(catalog),
  locations: locationRoutesV1(catalog),
  vark: varkRoutesV1(vark),
  deploy: deployRoutesV1({ authenticate: auth, deployment: deploymentUseCases, maxUploadMb: env.DEPLOY_MAX_MB }),
  playLocal: playLocalRoutes(new GetPlayFileUseCase(storages.published)),
}
