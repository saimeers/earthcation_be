import { Op, type IncludeOptions, type Model, type Transaction } from 'sequelize'
import sequelize from '../../config/database'
import models from '../../models'
import type { Fields, Identity, NewUser } from './domain'
import type { Account, AccountRepository, ImportDirectory, ImportedUser, Profile, ResetToken, UserFilter, UserReadModel } from './ports'

type Row = Readonly<Record<string, unknown>>

const plain = (m: Model): Row => m.get({ plain: true }) as Row
const textOr = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const fieldsOr = (v: unknown): Fields | null => (v !== null && typeof v === 'object' ? (v as Fields) : null)

const SECRET_ATTRS = ['password_hash', 'reset_token_hash', 'reset_token_expires']
const VARK_ATTRS = ['dominant_style', 'visual_score', 'auditory_score', 'reading_score']
const withPlace: IncludeOptions = {
  model: models.UserProfile, as: 'profile',
  include: [{ model: models.Organization, as: 'organization' }, { model: models.Location, as: 'location' }],
}
const withVark: IncludeOptions = { model: models.VarkResult, as: 'varkProfile', attributes: VARK_ATTRS }

// ── Cuentas ───────────────────────────────────────────────────────────────────

const profileOf = (r: Row): Row => fieldsOr(r.profile) ?? {}

const toAccount = (r: Row): Account => ({
  id: String(r.id), username: String(r.username), cedula: textOr(r.cedula), role: String(r.role), isActive: r.is_active === true,
  passwordHash: String(r.password_hash), firstName: textOr(r.first_name), lastName: textOr(r.last_name), email: textOr(r.email),
  dominantStyle: textOr(fieldsOr(r.varkProfile)?.dominant_style),
  organization: fieldsOr(profileOf(r).organization), location: fieldsOr(profileOf(r).location),
})

const findForLogin = async (cedula: string): Promise<Account | null> => {
  const user = await models.User.findOne({ where: { cedula }, include: [{ association: 'varkProfile' }, withPlace] })
  return user ? toAccount(plain(user)) : null
}

const findByEmail = async (email: string) => {
  const user = await models.User.findOne({ where: { email } })
  if (!user) return null
  const r = plain(user)
  return { id: String(r.id), email: String(r.email), name: textOr(r.first_name) || String(r.username) }
}

const findByResetToken = async (hash: string, now: Date): Promise<string | null> => {
  const user = await models.User.findOne({ where: { reset_token_hash: hash, reset_token_expires: { [Op.gt]: now } } })
  return user ? String(plain(user).id) : null
}

const updateUser = async (id: string, values: Fields): Promise<number> =>
  (await models.User.update(values, { where: { id } }))[0]

const exists = async (where: Fields): Promise<boolean> => (await models.User.count({ where })) > 0

const findIdentity = async (id: string): Promise<Identity | null> => {
  const user = await models.User.findByPk(id, { attributes: ['id', 'username', 'cedula'] })
  if (!user) return null
  const r = plain(user)
  return { id: String(r.id), username: String(r.username), cedula: textOr(r.cedula) }
}

const registeredCedulas = async (cedulas: readonly string[]): Promise<ReadonlySet<string>> => cedulas.length === 0
  ? new Set()
  : new Set((await models.User.findAll({ where: { cedula: [...new Set(cedulas)] }, attributes: ['cedula'] })).map((u) => String(plain(u).cedula)))

const withProfile = (user: Fields, profile: Profile): Promise<string> =>
  sequelize.transaction(async (transaction: Transaction) => {
    const created = await models.User.create(user, { transaction })
    const id = String(plain(created).id)
    await models.UserProfile.create({ user_id: id, ...profile }, { transaction })
    return id
  })

const resetColumns = (reset: ResetToken | null) =>
  ({ reset_token_hash: reset?.hash ?? null, reset_token_expires: reset?.expires ?? null })

const create = (u: NewUser, secrets: { readonly passwordHash: string; readonly reset: ResetToken | null }) => withProfile({
  ...u.details, username: u.username, email: u.email, cedula: u.cedula, role: u.role,
  password_hash: secrets.passwordHash, ...resetColumns(secrets.reset),
}, u.profile)

const createImported = (u: ImportedUser, profile: Profile) =>
  withProfile({ ...u.details, username: u.cedula, cedula: u.cedula, password_hash: u.passwordHash }, profile)

const updateProfile = async (id: string, patch: Fields): Promise<void> => {
  const [profile] = await models.UserProfile.findOrCreate({ where: { user_id: id }, defaults: { user_id: id } })
  await profile.update(patch)
}

export const accountRepository: AccountRepository = {
  findForLogin, findByEmail, findByResetToken, findIdentity, registeredCedulas, create, createImported, updateProfile,
  saveResetToken: async (id, token) => { await updateUser(id, resetColumns(token)) },
  savePassword: async (id, hash) => { await updateUser(id, { password_hash: hash, ...resetColumns(null) }) },
  usernameExists: (username) => exists({ username }),
  cedulaExists: (cedula) => exists({ cedula }),
  update: async (id, patch) => { await updateUser(id, patch) },
  setActive: async (id, active) => (await updateUser(id, { is_active: active })) > 0,
}

// ── Lecturas para el panel ────────────────────────────────────────────────────

const defined = (o: Fields): Fields => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))

// Con filtro de organización o localidad solo salen usuarios con perfil (join obligatorio, como antes)
const filteredPlace = (f: UserFilter): IncludeOptions => {
  const where = defined({ organization_id: f.organizationId, location_id: f.locationId })
  const required = Object.keys(where).length > 0
  return { ...withPlace, where: required ? where : undefined, required }
}

const list = async (f: UserFilter): Promise<readonly Fields[]> => (await models.User.findAll({
  where: defined({ role: f.role }), attributes: { exclude: SECRET_ATTRS },
  include: [filteredPlace(f), withVark], order: [['created_at', 'DESC']],
})).map(plain)

const get = async (id: string): Promise<Fields | null> => {
  const user = await models.User.findByPk(id, { attributes: { exclude: SECRET_ATTRS }, include: [withPlace, withVark] })
  return user ? plain(user) : null
}

const SESSION_ATTRS = ['id', 'name', 'code', 'status', 'started_at', 'ended_at', 'created_at']

const sessions = async (id: string): Promise<readonly Fields[]> => (await models.SessionUser.findAll({
  where: { user_id: id }, include: [{ model: models.TrainingSession, as: 'session', attributes: SESSION_ATTRS }],
  order: [['joined_at', 'DESC']],
})).map(plain)

export const userReadModel: UserReadModel = { list, get, sessions }

// ── Organizaciones y localidades de la importación ────────────────────────────

// Sin distinguir mayúsculas: el Excel casi nunca escribe el nombre igual a como está guardado
// ("CARBONES LA GARITA COAL SAS" vs "Carbones La Garita Coal S.A.S."); con igualdad exacta se duplicaban
const findOrCreate = async (table: typeof models.Organization, where: Fields, values: Fields) => {
  const like = Object.fromEntries(Object.entries(where).map(([k, v]) => [k, { [Op.iLike]: v }]))
  const existing = await table.findOne({ where: like })
  return existing
    ? { id: String(plain(existing).id), created: false }
    : { id: String(plain(await table.create({ ...where, ...values })).id), created: true }
}

export const importDirectory: ImportDirectory = {
  organization: (name) => findOrCreate(models.Organization, { name }, { type: 'institución' }),
  location: (p) => findOrCreate(models.Location, { municipality: p.municipality, department: p.department }, { country: 'Colombia' }),
}
