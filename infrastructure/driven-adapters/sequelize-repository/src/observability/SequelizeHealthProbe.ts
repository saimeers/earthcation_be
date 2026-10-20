import type { Sequelize } from 'sequelize'
import type { DatabaseHealthProbe, PoolState } from '@earthcation/model'

interface Pool { size: number; available: number; using: number; waiting: number; maxSize: number }

/** Ping a Postgres y estado del pool de Sequelize (que no expone el pool en sus tipos). */
export class SequelizeHealthProbe implements DatabaseHealthProbe {
  constructor(private readonly sequelize: Sequelize) {}

  async ping(): Promise<void> {
    await this.sequelize.query('SELECT 1')
  }

  pool(): PoolState | null {
    const pool = (this.sequelize.connectionManager as unknown as { pool?: Pool }).pool
    return pool ? { size: pool.size, available: pool.available, using: pool.using, waiting: pool.waiting, max: pool.maxSize } : null
  }
}
