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

export const routes = {
  organizations: organizationRoutesV1(catalog),
  locations: locationRoutesV1(catalog),
  vark: varkRoutesV1(vark),
}
