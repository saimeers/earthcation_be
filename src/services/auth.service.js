const { User, UserProfile }                    = require('../models');
const { hashPassword, comparePassword }        = require('../utils/hash.utils');
const { generateToken }                        = require('../utils/jwt.utils');
const { generateResetToken, hashToken }        = require('../utils/token.utils');
const { sendPasswordResetEmail }               = require('../utils/email.utils');
const { Op }                                   = require('sequelize');

const register = async ({ username, password, email, first_name, last_name, age, cedula, role, organization_id, location_id }) => {
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

  if (email) {
    const emailExists = await User.findOne({ where: { email } });
    if (emailExists) {
      const error = new Error('El correo ya está registrado');
      error.status = 409;
      throw error;
    }
  }

  const password_hash = await hashPassword(password);
  const user = await User.create({
    username, password_hash, email,
    first_name, last_name, age, cedula,
    role: role || 'player'
  });

  await UserProfile.create({
    user_id:         user.id,
    organization_id: organization_id || null,
    location_id:     location_id     || null
  });

  const token = generateToken({ id: user.id, username: user.username, role: user.role });

  return {
    token,
    user: { id: user.id, username: user.username, first_name, last_name, role: user.role }
  };
};

const login = async ({ cedula, password }) => {
  const user = await User.findOne({
    where: { cedula },
    include: [
      { association: 'varkProfile' },
      {
        association: 'profile',
        include: [
          { association: 'organization' },
          { association: 'location' }
        ]
      }
    ]
  });

  const valid = user && await comparePassword(password, user.password_hash);
  if (!valid) {
    const error = new Error('Credenciales inválidas');
    error.status = 401;
    throw error;
  }

  const token = generateToken({ id: user.id, username: user.cedula, role: user.role });

  return {
    token,
    user: {
      id:             user.id,
      username:       user.username,
      first_name:     user.first_name,
      last_name:      user.last_name,
      role:           user.role,
      cedula:         user.cedula,
      email:          user.email,
      vark_completed: !!user.varkProfile,
      dominant_style: user.varkProfile?.dominant_style || null,
      organization:   user.profile?.organization || null,
      location:       user.profile?.location     || null
    }
  };
};

const forgotPassword = async (email) => {
  const user = await User.findOne({ where: { email } });

  if (!user) {
    return { message: 'Si el correo está registrado recibirás un enlace en breve.' };
  }

  const rawToken    = generateResetToken();
  const hashedToken = hashToken(rawToken);
  const expires     = new Date(Date.now() + 15 * 60 * 1000);

  await user.update({
    reset_token_hash:    hashedToken,
    reset_token_expires: expires
  });

  await sendPasswordResetEmail({
    to:         user.email,
    username:   user.first_name || user.username,
    resetToken: rawToken
  });

  return { message: 'Si el correo está registrado recibirás un enlace en breve.' };
};

const resetPassword = async (rawToken, newPassword) => {
  const hashedToken = hashToken(rawToken);

  const user = await User.findOne({
    where: {
      reset_token_hash:    hashedToken,
      reset_token_expires: { [Op.gt]: new Date() }
    }
  });

  if (!user) {
    const error = new Error('Token inválido o expirado');
    error.status = 400;
    throw error;
  }

  const password_hash = await hashPassword(newPassword);
  await user.update({
    password_hash,
    reset_token_hash:    null,
    reset_token_expires: null
  });

  return { message: 'Contraseña actualizada correctamente' };
};

module.exports = { register, login, forgotPassword, resetPassword };