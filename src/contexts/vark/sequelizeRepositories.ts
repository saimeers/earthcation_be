import type { IncludeOptions, Model } from 'sequelize'
import models from '../../models'
import type { VarkProfile, VarkScores, Style } from './domain'
import type { PlaceFilter, VarkListingRow, VarkRepository } from './ports'

type VarkRow = {
  id: string; user_id: string; visual_score: number; auditory_score: number; reading_score: number; dominant_style: Style
}

const defined = (o: PlaceFilter) => Object.fromEntries(Object.entries(o).filter(([, v]) => Boolean(v)))
const plain = (m: Model): Readonly<Record<string, unknown>> => m.get({ plain: true }) as Record<string, unknown>
const toProfile = (r: VarkRow): VarkProfile => ({
  id: r.id, userId: r.user_id, visual: r.visual_score, auditory: r.auditory_score, reading: r.reading_score, dominantStyle: r.dominant_style,
})
const toRow = (userId: string, s: VarkScores) =>
  ({ user_id: userId, visual_score: s.visual, auditory_score: s.auditory, reading_score: s.reading, dominant_style: s.dominantStyle })

const USER_ATTRS = ['id', 'first_name', 'last_name', 'cedula']
const profileWithPlace: IncludeOptions = {
  model: models.UserProfile, as: 'profile', include: [{ association: 'organization' }, { association: 'location' }],
}
const withUser = (attributes: readonly string[]): IncludeOptions =>
  ({ model: models.User, as: 'user', attributes: [...attributes], include: [profileWithPlace] })

// Solo los jugadores con perfil en esa localidad (join obligatorio, como antes)
const withPlace = (where: PlaceFilter): IncludeOptions => ({
  model: models.User, as: 'user', attributes: USER_ATTRS, required: true,
  include: [{ model: models.UserProfile, as: 'profile', required: true,
    include: [{ model: models.Location, as: 'location', where: defined(where), required: true }] }],
})

const listing = async (options: object): Promise<readonly VarkListingRow[]> =>
  (await models.VarkResult.findAll(options)).map(plain)

export const varkRepository: VarkRepository = {
  save: async (userId, scores) => ({ created: Boolean((await models.VarkResult.upsert(toRow(userId, scores), { returning: true }))[1]) }),
  findByUser: async (userId) => {
    const row = await models.VarkResult.findOne({ where: { user_id: userId } })
    return row ? toProfile(plain(row) as VarkRow) : null
  },
  listAll: () => listing({ include: [withUser([...USER_ATTRS, 'role'])], order: [['dominant_style', 'ASC']] }),
  listByStyle: (style) => listing({ where: { dominant_style: style }, include: [withUser(USER_ATTRS)] }),
  listByPlace: (filter) => listing({ include: [withPlace(filter)], order: [['dominant_style', 'ASC']] }),
}
