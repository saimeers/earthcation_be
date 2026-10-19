import type { Model, Transaction } from 'sequelize'
import sequelize from '../../config/database'
import models from '../../models'
import type { Published, Status, Version } from './domain'
import type { VersionRepository, VersionView } from './ports'

type Row = Readonly<Record<string, unknown>>

const ACTIVE_KEY = 'active_version_id'

const plain = (m: Model): Row => m.get({ plain: true }) as Row
const textOr = (v: unknown): string | null => (typeof v === 'string' ? v : null)

const toVersion = (r: Row): Version => ({
  id: String(r.id), label: String(r.label), status: r.status as Status, s3Key: textOr(r.s3_key), r2Prefix: textOr(r.r2_prefix),
  manifest: r.manifest !== null && typeof r.manifest === 'object' ? (r.manifest as Row) : null,
  activatedAt: r.activated_at instanceof Date ? r.activated_at : null,
})

const byId = (id: string) => models.GameVersion.findByPk(id)

const find = async (id: string): Promise<Version | null> => {
  const row = await byId(id)
  return row ? toVersion(plain(row)) : null
}

const view = async (id: string): Promise<VersionView | null> => {
  const row = await byId(id)
  return row ? plain(row) : null
}

const list = async (): Promise<readonly VersionView[]> => (await models.GameVersion.findAll({
  include: [{ model: models.User, as: 'uploader', attributes: ['id', 'first_name', 'last_name'] }],
  order: [['created_at', 'DESC']],
})).map(plain)

// El manifiesto se guarda en snake_case, como lo lee el panel por v1
const manifestRow = (p: Published) => ({
  root: p.manifest.root, compression: p.manifest.compression, product_version: p.manifest.productVersion,
  total_bytes: p.manifest.totalBytes, files: p.manifest.files, warnings: p.manifest.warnings, publish_ms: p.publishMs,
})

const update = async (id: string, values: Row, where: Row = {}): Promise<number> =>
  (await models.GameVersion.update(values, { where: { ...where, id } }))[0]

const activeId = async (): Promise<string | null> => {
  const setting = await models.GameSetting.findByPk(ACTIVE_KEY)
  return setting ? textOr(plain(setting).value) : null
}

const activate = async (id: string, at: Date, writePointer: () => Promise<void>): Promise<void> => {
  await sequelize.transaction(async (transaction: Transaction) => {
    await models.GameSetting.upsert({ key: ACTIVE_KEY, value: id }, { transaction })
    await models.GameVersion.update({ activated_at: at }, { where: { id }, transaction })
    await writePointer()
  })
}

export const versionRepository: VersionRepository = {
  find, view, list, activeId, activate,
  create: async (id, v) => plain(await models.GameVersion.create({
    id, label: v.label, notes: v.notes, size_bytes: v.sizeBytes, s3_key: v.s3Key, uploaded_by: v.uploadedBy,
  })),
  startProcessing: async (id, from, sizeBytes) => (await update(id, { status: 'processing', error: null, size_bytes: sizeBytes }, { status: from })) > 0,
  markReady: async (id, p) => {
    await update(id, { status: 'ready', r2_prefix: p.prefix, error: null, published_at: p.at, manifest: manifestRow(p) })
  },
  markFailed: async (id, error) => { await update(id, { status: 'failed', error }) },
  failInterrupted: async (reason) => { await models.GameVersion.update({ status: 'failed', error: reason }, { where: { status: 'processing' } }) },
  remove: async (id) => { await models.GameVersion.destroy({ where: { id } }) },
}
