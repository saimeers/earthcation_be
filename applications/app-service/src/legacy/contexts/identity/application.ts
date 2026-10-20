import type { DomainError } from '../../shared/errors'
import { andThen, err, fromNullable, ok, type Result } from '../../shared/result'
import {
  asText, canEdit, cannotEditUser, cedulaRequired, cedulaTaken, changed, emailRequired, inactiveUser, invalidCredentials,
  invalidResetToken, needsPassword, resetFieldsRequired, RESET_TTL_MS, toNewUser, toUserPatch, userNotFound, usernameTaken,
  type Fields, type Identity, type NewUser, type Requester,
} from './domain'
import type { Account, IdentityDeps, ResetToken, UserFilter } from './ports'
import { makeBulkImport } from './bulkImport'

type Outcome<T> = Promise<Result<T, DomainError>>
export type Session = { readonly token: string; readonly account: Account }
export type Creation = { readonly userId: string; readonly emailSent: boolean; readonly notified: 'player' | 'sent' | 'failed' }

// ── Login ────────────────────────────────────────────────────────────────────

const checkPassword = async (d: IdentityDeps, a: Account, password: unknown): Promise<boolean> =>
  !needsPassword(a.role) || (typeof password === 'string' && password !== '' && (await d.passwords.matches(password, a.passwordHash)))

// El juego (jugadores) entra solo con cédula; el panel (staff) exige contraseña. Mismo endpoint: la exigencia
// depende del rol del usuario encontrado, no de lo que mande el cliente.
const login = (d: IdentityDeps) => async (cedula: unknown, password: unknown): Outcome<Session> => {
  const text = asText(cedula)
  if (text === null) return err(cedulaRequired())
  const account = await d.accounts.findForLogin(text)
  if (account === null || !(await checkPassword(d, account, password))) return err(invalidCredentials())
  if (!account.isActive) return err(inactiveUser())
  return ok({ token: d.tokens.issue({ id: account.id, username: account.cedula, role: account.role }), account })
}

// ── Restablecer contraseña ───────────────────────────────────────────────────

const newResetToken = (d: IdentityDeps): { readonly raw: string; readonly token: ResetToken } => {
  const raw = d.resetTokens.generate()
  return { raw, token: { hash: d.resetTokens.hash(raw), expires: new Date(d.now() + RESET_TTL_MS) } }
}

// Responde igual exista o no el correo (no revela qué cuentas existen)
const forgotPassword = (d: IdentityDeps) => async (email: unknown): Outcome<null> => {
  const text = asText(email)
  if (text === null) return err(emailRequired())
  const target = await d.accounts.findByEmail(text)
  if (target === null) return ok(null)
  const { raw, token } = newResetToken(d)
  await d.accounts.saveResetToken(target.id, token)
  await d.mailer.passwordReset({ to: target.email, username: target.name, resetToken: raw })
  return ok(null)
}

const resetPassword = (d: IdentityDeps) => async (token: unknown, password: unknown): Outcome<null> => {
  const raw = asText(token)
  const plain = asText(password)
  if (raw === null || plain === null) return err(resetFieldsRequired())
  const id = await d.accounts.findByResetToken(d.resetTokens.hash(raw), new Date(d.now()))
  if (id === null) return err(invalidResetToken())
  await d.accounts.savePassword(id, await d.passwords.hash(plain))
  return ok(null)
}

// ── Alta por el admin ─────────────────────────────────────────────────────────

const ensureFree = async (d: IdentityDeps, u: NewUser): Outcome<NewUser> =>
  (await d.accounts.usernameExists(u.username)) ? err(usernameTaken())
    : u.cedula !== null && (await d.accounts.cedulaExists(u.cedula)) ? err(cedulaTaken()) : ok(u)

// Los jugadores entran solo con la cédula: nunca se les envía la contraseña generada
const welcome = async (d: IdentityDeps, u: NewUser, mail: { readonly temporaryPassword: string; readonly resetToken: string }) =>
  d.mailer.welcome({ to: u.email ?? '', username: u.firstName ?? u.username, ...mail }).then(
    () => 'sent' as const,
    // El usuario ya existe — no responder 500 (el admin reintentaría y chocaría con "cédula ya registrada")
    (e: unknown) => { d.logError(`[EMAIL] No se pudo enviar el correo de bienvenida: ${e instanceof Error ? e.message : String(e)}`); return 'failed' as const })

const register = (d: IdentityDeps) => async (u: NewUser): Outcome<Creation> => {
  const temporaryPassword = d.passwords.generate()
  const reset = needsPassword(u.role) ? newResetToken(d) : null
  const userId = await d.accounts.create(u, { passwordHash: await d.passwords.hash(temporaryPassword), reset: reset?.token ?? null })
  const notified = reset ? await welcome(d, u, { temporaryPassword, resetToken: reset.raw }) : 'player'
  return ok({ userId, emailSent: notified === 'sent', notified })
}

const create = (d: IdentityDeps) => (data: Fields): Outcome<Creation> =>
  andThen(andThen(toNewUser(data), (u) => ensureFree(d, u)), register(d))

// ── Edición ───────────────────────────────────────────────────────────────────

const get = (d: IdentityDeps) => async (id: string): Outcome<Fields> => fromNullable(await d.users.get(id), userNotFound)

const conflictOf = async (d: IdentityDeps, current: Identity, patch: Fields): Promise<DomainError | null> => {
  const username = changed(patch.username, current.username)
  if (username !== null && (await d.accounts.usernameExists(username))) return usernameTaken()
  const cedula = changed(patch.cedula, current.cedula)
  return cedula !== null && (await d.accounts.cedulaExists(cedula)) ? cedulaTaken() : null
}

const applyPatch = (d: IdentityDeps, data: Fields, r: Requester) => async (current: Identity): Outcome<Fields> => {
  const patch = toUserPatch(data, r)
  const conflict = await conflictOf(d, current, patch.user)
  if (conflict !== null) return err(conflict)
  await d.accounts.update(current.id, patch.user)
  if (Object.keys(patch.profile).length > 0) await d.accounts.updateProfile(current.id, patch.profile)
  return get(d)(current.id)
}

const update = (d: IdentityDeps) => async (id: string, r: Requester, data: Fields): Outcome<Fields> =>
  canEdit(id, r)
    ? andThen(fromNullable(await d.accounts.findIdentity(id), userNotFound), applyPatch(d, data, r))
    : err(cannotEditUser())

const setActive = (d: IdentityDeps, active: boolean) => async (id: string): Outcome<null> =>
  (await d.accounts.setActive(id, active)) ? ok(null) : err(userNotFound())

const accountUseCases = (d: IdentityDeps) => ({
  login: login(d),
  forgotPassword: forgotPassword(d),
  resetPassword: resetPassword(d),
})

const userUseCases = (d: IdentityDeps) => ({
  create: create(d),
  list: (filter: UserFilter) => d.users.list(filter),
  get: get(d),
  sessions: (id: string) => d.users.sessions(id),
  update: update(d),
  disable: setActive(d, false),
  enable: setActive(d, true),
})

export const makeIdentity = (d: IdentityDeps) => ({ ...accountUseCases(d), ...userUseCases(d), ...makeBulkImport(d) })

export type IdentityUseCases = ReturnType<typeof makeIdentity>
