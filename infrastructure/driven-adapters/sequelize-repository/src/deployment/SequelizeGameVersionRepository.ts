import type { Sequelize } from 'sequelize'
import type {
  GameVersion, GameVersionListing, GameVersionRepository, NewGameVersion, VersionStatus,
} from '@earthcation/model'
import type { Models } from '../models'
import { rowOf } from '../catalog/mappers'
import { lifecycleColumns, toGameVersion, toListing, type GameVersionRow, type UploaderRow } from './mappers'

// Un solo puntero a la versión activa (game_settings), cambiado en transacción: evita dos versiones activas
const ACTIVE_KEY = 'active_version_id'

export class SequelizeGameVersionRepository implements GameVersionRepository {
  constructor(private readonly sequelize: Sequelize, private readonly models: Models) {}

  async findById(id: string): Promise<GameVersion | null> {
    const row = await this.models.GameVersion.findByPk(id)
    return row ? toGameVersion(rowOf<GameVersionRow>(row)) : null
  }

  async list(): Promise<GameVersionListing[]> {
    const rows = await this.models.GameVersion.findAll({
      include: [{ model: this.models.User, as: 'uploader', attributes: ['id', 'first_name', 'last_name'] }],
      order: [['created_at', 'DESC']],
    })
    return rows.map((m) => toListing(rowOf<GameVersionRow & { uploader: UploaderRow | null }>(m)))
  }

  async activeId(): Promise<string | null> {
    const setting = await this.models.GameSetting.findByPk(ACTIVE_KEY)
    const value = setting ? rowOf<{ value: unknown }>(setting).value : null
    return typeof value === 'string' ? value : null
  }

  async create(v: NewGameVersion): Promise<GameVersion> {
    const row = await this.models.GameVersion.create({
      id: v.id, label: v.label, notes: v.notes, size_bytes: v.sizeBytes, s3_key: v.originalKey, uploaded_by: v.uploadedBy,
    })
    return toGameVersion(rowOf<GameVersionRow>(row))
  }

  async startProcessing(v: GameVersion, from: VersionStatus): Promise<boolean> {
    const { status, error, size_bytes } = lifecycleColumns(v)
    const [changed] = await this.models.GameVersion.update({ status, error, size_bytes }, { where: { id: v.id, status: from } })
    return changed > 0
  }

  async save(v: GameVersion): Promise<void> {
    await this.models.GameVersion.update(lifecycleColumns(v), { where: { id: v.id } })
  }

  async saveNotes(v: GameVersion): Promise<void> {
    await this.models.GameVersion.update({ notes: v.notes }, { where: { id: v.id } })
  }

  async failInterrupted(reason: string): Promise<void> {
    await this.models.GameVersion.update({ status: 'failed', error: reason }, { where: { status: 'processing' } })
  }

  async remove(id: string): Promise<void> {
    await this.models.GameVersion.destroy({ where: { id } })
  }

  async activate(v: GameVersion, writePointer: () => Promise<void>): Promise<void> {
    await this.sequelize.transaction(async (transaction) => {
      await this.models.GameSetting.upsert({ key: ACTIVE_KEY, value: v.id }, { transaction })
      await this.models.GameVersion.update({ activated_at: v.activatedAt }, { where: { id: v.id }, transaction })
      await writePointer()
    })
  }
}
