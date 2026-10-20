import { Op, type Sequelize, type WhereOptions } from 'sequelize'
import type { NewUser, User, UserRepository, UserSecrets } from '@earthcation/model'
import type { Models } from '../models'
import { newUserColumns, profileColumns, rowOf, toUser, userColumns, type ProfileRow, type UserRow } from './mappers'

/** Cuentas en `users` con su perfil (`user_profiles`: organización y localidad). */
export class SequelizeUserRepository implements UserRepository {
  constructor(private readonly sequelize: Sequelize, private readonly models: Models) {}

  async findById(id: string): Promise<User | null> {
    return this.findOne({ id })
  }

  async findByCedula(cedula: string): Promise<User | null> {
    return this.findOne({ cedula })
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.findOne({ email })
  }

  async findByResetToken(hash: string, now: Date): Promise<User | null> {
    return this.findOne({ reset_token_hash: hash, reset_token_expires: { [Op.gt]: now } })
  }

  async usernameExists(username: string): Promise<boolean> {
    return (await this.models.User.count({ where: { username } })) > 0
  }

  async cedulaExists(cedula: string): Promise<boolean> {
    return (await this.models.User.count({ where: { cedula } })) > 0
  }

  async registeredCedulas(cedulas: readonly string[]): Promise<ReadonlySet<string>> {
    if (cedulas.length === 0) return new Set()
    const rows = await this.models.User.findAll({ where: { cedula: [...new Set(cedulas)] }, attributes: ['cedula'] })
    return new Set(rows.map((m) => rowOf<{ cedula: string }>(m).cedula))
  }

  // Usuario y perfil juntos: no queda un usuario sin perfil si algo falla a mitad
  async create(user: NewUser, secrets: UserSecrets): Promise<string> {
    return this.sequelize.transaction(async (transaction) => {
      const { id } = rowOf<{ id: string }>(await this.models.User.create(newUserColumns(user, secrets), { transaction }))
      await this.models.UserProfile.create({ user_id: id, ...profileColumns(user.placement) }, { transaction })
      return id
    })
  }

  async save(user: User): Promise<void> {
    await this.models.User.update(userColumns(user), { where: { id: user.id } })
    const { placement } = user.toProps()
    if (placement) await this.saveProfile(user.id, profileColumns(placement))
  }

  // Crea el perfil si el usuario no lo tenía
  private async saveProfile(userId: string, values: ProfileRow): Promise<void> {
    const [profile] = await this.models.UserProfile.findOrCreate({ where: { user_id: userId }, defaults: { user_id: userId } })
    await profile.update({ ...values })
  }

  private async findOne(where: WhereOptions): Promise<User | null> {
    const row = await this.models.User.findOne({ where, include: [{ model: this.models.UserProfile, as: 'profile' }] })
    return row ? toUser(rowOf<UserRow>(row)) : null
  }
}
