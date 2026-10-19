const sequelize = require('../config/database')
const { User, UserProfile, VarkResult, Organization, Location, SessionUser, TrainingSession } = require('../models');
const { sendWelcomeEmail }       = require('../utils/email.utils');
const { hashPassword }           = require('../utils/hash.utils');
const { generateRandomPassword } = require('../utils/password.utils');
const { generateResetToken, hashToken } = require('../utils/token.utils');

const defaultIncludes = [
  {
    model: UserProfile,
    as: 'profile',
    include: [
      { model: Organization, as: 'organization' },
      { model: Location,     as: 'location' }
    ]
  },
  {
    model: VarkResult,
    as: 'varkProfile',
    attributes: ['dominant_style', 'visual_score', 'auditory_score', 'reading_score']
  }
]

// Los formularios mandan '' en los campos opcionales vacíos — '' rompe la validación isEmail,
// el INTEGER de edad y los UUID de organización/localidad, así que se convierten a null.
const blankToNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v)
const clean = (data, keys) => {
  const out = {}
  keys.forEach(k => {
    if (data[k] === undefined) return
    const v = blankToNull(data[k])
    out[k] = typeof v === 'string' ? v.trim() : v
  })
  return out
}
const conflict = (msg) => Object.assign(new Error(msg), { status: 409 })
const badRequest = (msg) => Object.assign(new Error(msg), { status: 400 })

const createByAdmin = async (data) => {
  const { email, first_name, last_name, cedula, age, role, organization_id, location_id, username: rawUsername } =
    clean(data, ['username', 'email', 'first_name', 'last_name', 'cedula', 'age', 'role', 'organization_id', 'location_id'])
  const finalRole = role || 'player'
  // Igual que la importación masiva: si no se da usuario, se usa la cédula (el jugador entra con ella).
  const username = rawUsername || cedula

  if (!username) throw badRequest('La cédula o el nombre de usuario son requeridos')
  // Admin/instructor entran al panel con contraseña — se la mandamos por correo, así que es obligatorio.
  if (finalRole !== 'player' && !email) throw badRequest('El correo es obligatorio para instructores y administradores')

  if (await User.findOne({ where: { username } })) throw conflict('El nombre de usuario ya está en uso')
  if (cedula && await User.findOne({ where: { cedula } })) throw conflict('La cédula ya está registrada')

  const temporaryPassword = generateRandomPassword()
  const password_hash     = await hashPassword(temporaryPassword)

  const rawToken    = generateResetToken()
  const hashedToken = hashToken(rawToken)
  const expires     = new Date(Date.now() + 15 * 60 * 1000)

  const user = await sequelize.transaction(async (transaction) => {
    const created = await User.create({
      username, email, first_name, last_name, cedula, age,
      role: finalRole,
      password_hash,
      reset_token_hash:    finalRole === 'player' ? null : hashedToken,
      reset_token_expires: finalRole === 'player' ? null : expires,
    }, { transaction })

    await UserProfile.create({
      user_id:         created.id,
      organization_id: organization_id || null,
      location_id:     location_id     || null
    }, { transaction })
    return created
  })

  // Los jugadores entran solo con la cédula — nunca se les envía la contraseña generada.
  if (finalRole === 'player') {
    return { message: 'Usuario creado', user_id: user.id, email_sent: false }
  }

  try {
    await sendWelcomeEmail({
      to:                email,
      username:          first_name || username,
      temporaryPassword,
      resetToken:        rawToken
    })
    return { message: 'Usuario creado y correo enviado', user_id: user.id, email_sent: true }
  } catch (err) {
    // El usuario ya existe — no devolver 500 (el admin reintentaría y chocaría con "cédula ya registrada").
    console.error(`[EMAIL] No se pudo enviar el correo de bienvenida: ${err.message}`)
    return { message: 'Usuario creado, pero no se pudo enviar el correo', user_id: user.id, email_sent: false }
  }
}

const getAll = async ({ role, organization_id, location_id } = {}) => {
  const where = {}
  if (role) where.role = role

  const profileWhere = {}
  if (organization_id) profileWhere.organization_id = organization_id
  if (location_id)     profileWhere.location_id     = location_id

  return User.findAll({
    where,
    attributes: { exclude: ['password_hash', 'reset_token_hash', 'reset_token_expires'] },
    include: [
      {
        model: UserProfile,
        as: 'profile',
        where: Object.keys(profileWhere).length ? profileWhere : undefined,
        required: Object.keys(profileWhere).length > 0,
        include: [
          { model: Organization, as: 'organization' },
          { model: Location,     as: 'location' }
        ]
      },
      {
        model: VarkResult,
        as: 'varkProfile',
        attributes: ['dominant_style', 'visual_score', 'auditory_score', 'reading_score']
      }
    ],
    order: [['created_at', 'DESC']]
  })
}

const getById = async (id) => {
  const user = await User.findByPk(id, {
    attributes: { exclude: ['password_hash', 'reset_token_hash', 'reset_token_expires'] },
    include: defaultIncludes
  })
  if (!user) {
    const error = new Error('Usuario no encontrado')
    error.status = 404
    throw error
  }
  return user
}

const update = async (id, requesterId, requesterRole, data) => {
  if (requesterId !== id && requesterRole !== 'admin') {
    const error = new Error('No tienes permiso para editar este usuario')
    error.status = 403
    throw error
  }

  const user = await User.findByPk(id)
  if (!user) {
    const error = new Error('Usuario no encontrado')
    error.status = 404
    throw error
  }

  // Quien no es admin solo edita sus datos personales: rol, cédula, usuario, organización y localidad
  // se ignoran (antes un jugador podía mandar {role:'admin'} y volverse administrador)
  const isAdmin = requesterRole === 'admin'
  const updateData = clean(data, isAdmin
    ? ['first_name', 'last_name', 'age', 'cedula', 'email', 'username', 'role']
    : ['first_name', 'last_name', 'age', 'email'])

  if (updateData.username && updateData.username !== user.username &&
      await User.findOne({ where: { username: updateData.username } })) {
    throw conflict('El nombre de usuario ya está en uso')
  }
  if (updateData.cedula && updateData.cedula !== user.cedula &&
      await User.findOne({ where: { cedula: updateData.cedula } })) {
    throw conflict('La cédula ya está registrada')
  }
  if (updateData.username === null) delete updateData.username // username es NOT NULL

  await user.update(updateData)

  const profileData = isAdmin ? clean(data, ['organization_id', 'location_id']) : {}
  if (Object.keys(profileData).length) {
    const [profile] = await UserProfile.findOrCreate({ where: { user_id: id }, defaults: { user_id: id } })
    await profile.update(profileData)
  }

  return getById(id)
}

const disable = async (id) => {
  const user = await User.findByPk(id)
  if (!user) {
    const error = new Error('Usuario no encontrado')
    error.status = 404
    throw error
  }
  await user.update({ is_active: false })
  return { message: 'Usuario deshabilitado correctamente' }
}

const enable = async (id) => {
  const user = await User.findByPk(id)
  if (!user) {
    const error = new Error('Usuario no encontrado')
    error.status = 404
    throw error
  }
  await user.update({ is_active: true })
  return { message: 'Usuario habilitado correctamente' }
}

const getSessions = async (id) => {
  return SessionUser.findAll({
    where: { user_id: id },
    include: [{
      model: TrainingSession,
      as: 'session',
      attributes: ['id', 'name', 'code', 'status', 'started_at', 'ended_at', 'created_at']
    }],
    order: [['joined_at', 'DESC']]
  })
}

module.exports = { getAll, getById, update, disable, enable, createByAdmin, getSessions }