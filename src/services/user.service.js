const { User, UserProfile, VarkResult, Organization, Location, UserRiskProgress } = require('../models');
const { sendWelcomeEmail } = require('../utils/email.utils');
const { hashPassword } = require('../utils/hash.utils');
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
  { model: VarkResult, as: 'varkProfile', attributes: ['dominant_style', 'visual_score', 'auditory_score', 'reading_score'] }
];

const createByAdmin = async ({ username, email, first_name, last_name, cedula, age, role, organization_id, location_id }) => {
  const existing = await User.findOne({ where: { username } });
  if (existing) {
    const error = new Error('El nombre de usuario ya está en uso');
    error.status = 409;
    throw error;
  }

  if (cedula) {
    const cedulaExists = await User.findOne({ where: { cedula } });
    if (cedulaExists) {
      const error = new Error('La cédula ya está registrada');
      error.status = 409;
      throw error;
    }
  }

  const temporaryPassword = generateRandomPassword();
  const password_hash     = await hashPassword(temporaryPassword);

  const rawToken    = generateResetToken();
  const hashedToken = hashedToken(rawToken);
  const expires     = new Date(Date.now() + 15 * 60 * 1000);

  const user = await User.create({
    username, email, first_name, last_name, cedula, age,
    role: role || 'player',
    password_hash,
    reset_token_hash:    hashedToken,
    reset_token_expires: expires
  });

  await UserProfile.create({
    user_id:         user.id,
    organization_id: organization_id || null,
    location_id:     location_id     || null
  });

  await sendWelcomeEmail({
    to:                email,
    username:          first_name || username,
    temporaryPassword,
    resetToken:        rawToken
  });

  return { message: 'Usuario creado y correo enviado', user_id: user.id };
};

const getAll = async ({ role, organization_id, location_id } = {}) => {
  const where = {};
  if (role) where.role = role;

  const profileWhere = {};
  if (organization_id) profileWhere.organization_id = organization_id;
  if (location_id)     profileWhere.location_id     = location_id;

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
      { model: VarkResult, as: 'varkProfile', attributes: ['dominant_style', 'visual_score', 'auditory_score', 'reading_score'] }
    ],
    order: [['created_at', 'DESC']]
  });
};

const getById = async (id) => {
  const user = await User.findByPk(id, {
    attributes: { exclude: ['password_hash', 'reset_token_hash', 'reset_token_expires'] },
    include: defaultIncludes
  });

  if (!user) {
    const error = new Error('Usuario no encontrado');
    error.status = 404;
    throw error;
  }
  return user;
};

const update = async (id, requesterId, requesterRole, data) => {
  if (requesterId !== id && requesterRole !== 'admin') {
    const error = new Error('No tienes permiso para editar este usuario');
    error.status = 403;
    throw error;
  }

  const user = await User.findByPk(id);
  if (!user) {
    const error = new Error('Usuario no encontrado');
    error.status = 404;
    throw error;
  }

  const { first_name, last_name, age, cedula, organization_id, location_id } = data;

  await user.update({ first_name, last_name, age, cedula });

  if (organization_id !== undefined || location_id !== undefined) {
    await UserProfile.update(
      { organization_id, location_id },
      { where: { user_id: id } }
    );
  }

  return getById(id);
};

const remove = async (id) => {
  const user = await User.findByPk(id);
  if (!user) {
    const error = new Error('Usuario no encontrado');
    error.status = 404;
    throw error;
  }
  await user.destroy();
  return { message: 'Usuario eliminado correctamente' };
};

module.exports = { getAll, getById, update, remove, createByAdmin };