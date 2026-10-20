import {
  IdentifierAvailability, ResetTokenFactory, User,
  type Clock, type ImportDirectory, type LoginProfile, type Mailer, type NewUser, type PasswordGenerator, type PasswordHasher,
  type PasswordResetMail, type UserListingRow, type UserProps, type UserReadModel, type UserRepository, type UserSecrets,
  type WelcomeMail,
} from '@earthcation/model'

/** Repositorio en memoria de cuentas. */
export class InMemoryUserRepository implements UserRepository {
  readonly rows = new Map<string, User>()
  /** Cédula con la que `create` falla, para probar una fila rota de la importación. */
  failOn?: string

  add(props: Partial<UserProps> & { id: string }): User {
    const user = User.restore({
      username: props.id, cedula: null, email: null, firstName: null, lastName: null, age: null, role: 'player', isActive: true,
      passwordHash: 'h:x', resetToken: null, placement: null, ...props,
    })
    this.rows.set(user.id, user)
    return user
  }

  // Copias: como en la BD, editar la entidad leída no cambia lo guardado hasta save
  private copy(u: User | undefined) { return u ? User.restore(u.toProps()) : null }
  private find(test: (u: User) => boolean) { return Promise.resolve(this.copy([...this.rows.values()].find(test))) }

  findById(id: string) { return Promise.resolve(this.copy(this.rows.get(id))) }
  findByCedula(cedula: string) { return this.find((u) => u.cedula === cedula) }
  findByEmail(email: string) { return this.find((u) => u.email === email) }
  findByResetToken(hash: string, now: Date) {
    return this.find((u) => { const t = u.toProps().resetToken; return t?.hash === hash && t.expires > now })
  }
  usernameExists(username: string) { return Promise.resolve([...this.rows.values()].some((u) => u.username === username)) }
  cedulaExists(cedula: string) { return Promise.resolve([...this.rows.values()].some((u) => u.cedula === cedula)) }
  registeredCedulas(cedulas: readonly string[]) {
    return Promise.resolve(new Set(cedulas.filter((c) => [...this.rows.values()].some((u) => u.cedula === c))))
  }

  create(u: NewUser, secrets: UserSecrets) {
    if (u.cedula !== null && u.cedula === this.failOn) return Promise.reject(new Error('valor inválido'))
    const id = `n${this.rows.size + 1}`
    this.add({ ...u, id, passwordHash: secrets.passwordHash, resetToken: secrets.resetToken })
    return Promise.resolve(id)
  }

  save(u: User) { this.rows.set(u.id, u); return Promise.resolve() }
}

/** Lecturas del panel sobre el repositorio en memoria. */
export class InMemoryUserReadModel implements UserReadModel {
  constructor(private readonly users: InMemoryUserRepository) {}

  private row(id: string): UserListingRow | null {
    const u = this.users.rows.get(id)
    return u ? { ...u.toProps() } : null
  }

  list() { return Promise.resolve([...this.users.rows.keys()].map((id) => this.row(id) ?? {})) }
  get(id: string) { return Promise.resolve(this.row(id)) }
  sessions() { return Promise.resolve([]) }
  loginProfile(): Promise<LoginProfile> { return Promise.resolve({ dominantStyle: null, organization: null, location: null }) }
}

export const fakeHasher: PasswordHasher = {
  hash: (plain) => Promise.resolve(`h:${plain}`),
  matches: (plain, hash) => Promise.resolve(hash === `h:${plain}`),
}

export const fakeGenerator: PasswordGenerator = { generate: () => 'temporal' }

export const fixedClock: Clock = { now: () => new Date(1000) }

export const fakeResetTokens = (clock: Clock = fixedClock) =>
  new ResetTokenFactory({ generate: () => 'crudo', hash: (raw) => `sha:${raw}` }, clock)

/** Guarda los correos; el destinatario `cae@x.co` simula que Resend está caído. */
export class FakeMailer implements Mailer {
  readonly sent: (WelcomeMail | PasswordResetMail)[] = []

  sendWelcome(m: WelcomeMail) {
    if (m.to === 'cae@x.co') return Promise.reject(new Error('Resend caído'))
    this.sent.push(m)
    return Promise.resolve()
  }

  sendPasswordReset(m: PasswordResetMail) { this.sent.push(m); return Promise.resolve() }
}

/** Organizaciones y localidades encontradas o creadas, sin distinguir mayúsculas. */
export class InMemoryDirectory implements ImportDirectory {
  readonly names: string[] = []

  organization(name: string) {
    const i = this.names.findIndex((n) => n.toLowerCase() === name.toLowerCase())
    if (i >= 0) return Promise.resolve({ id: `o${i}`, created: false })
    this.names.push(name)
    return Promise.resolve({ id: `o${this.names.length - 1}`, created: true })
  }

  location() { return Promise.resolve({ id: 'l1', created: false }) }
}

export const availabilityOf = (users: UserRepository) => new IdentifierAvailability(users)
