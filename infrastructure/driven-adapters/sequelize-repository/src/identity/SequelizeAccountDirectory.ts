import { ROLES, type AccountDirectory, type AccountStatus, type Cache, type Role } from '@earthcation/model'
import type { Models } from '../models'

const TTL_SECONDS = 60

const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v)

/**
 * Estado vigente de una cuenta (activa y con qué rol), con una caché de 60 s: una cuenta deshabilitada o con otro rol
 * lo nota la API en un minuto sin consultar la base de datos en cada petición.
 */
export class SequelizeAccountDirectory implements AccountDirectory {
  constructor(private readonly models: Models, private readonly cache: Cache) {}

  find(userId: string): Promise<AccountStatus | null> {
    return this.cache.remember({ namespace: 'account', key: userId, ttlSeconds: TTL_SECONDS }, () => this.load(userId))
  }

  private async load(userId: string): Promise<AccountStatus | null> {
    const row = await this.models.User.findByPk(userId, { attributes: ['role', 'is_active'], raw: true })
    const { role, is_active: isActive } = (row ?? {}) as { role?: unknown, is_active?: unknown }
    return isRole(role) ? { role, isActive: isActive !== false } : null
  }
}
