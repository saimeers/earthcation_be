const { VarkResult, User, UserProfile, Location } = require('../models');
const { calculateVarkScores } = require('../utils/vark.utils');

const submitVark = async (userId, answers) => {
  const scores = calculateVarkScores(answers);

  const [, created] = await VarkResult.upsert(
    { user_id: userId, ...scores },
    { returning: true }
  );

  return { result: scores, created };
};

const getVarkByUser = async (userId) => {
  const result = await VarkResult.findOne({ where: { user_id: userId } });
  if (!result) {
    const error = new Error('No hay resultado VARK para este usuario');
    error.status = 404;
    throw error;
  }
  return result;
};

const getAllVark = async () => {
  return VarkResult.findAll({
    include: [{
      model: User,
      as: 'user',
      attributes: ['id', 'first_name', 'last_name', 'cedula', 'role'],
      include: [{
        model: UserProfile,
        as: 'profile',
        include: [{ association: 'organization' }, { association: 'location' }]
      }]
    }],
    order: [['dominant_style', 'ASC']]
  });
};

const getVarkByStyle = async (style) => {
  const validStyles = ['Visual', 'Auditivo', 'Lector/Escritor'];
  if (!validStyles.includes(style)) {
    const error = new Error(`Estilo inválido. Usa: ${validStyles.join(', ')}`);
    error.status = 400;
    throw error;
  }

  return VarkResult.findAll({
    where: { dominant_style: style },
    include: [{
      model: User,
      as: 'user',
      attributes: ['id', 'first_name', 'last_name', 'cedula'],
      include: [{
        model: UserProfile,
        as: 'profile',
        include: [{ association: 'organization' }, { association: 'location' }]
      }]
    }]
  });
};

const getVarkByLocation = async ({ department, municipality }) => {
  const locationWhere = {};
  if (department)   locationWhere.department   = department;
  if (municipality) locationWhere.municipality = municipality;

  return VarkResult.findAll({
    include: [{
      model: User,
      as: 'user',
      attributes: ['id', 'first_name', 'last_name', 'cedula'],
      required: true,
      include: [{
        model: UserProfile,
        as: 'profile',
        required: true,
        include: [{
          model: Location,
          as: 'location',
          where: locationWhere,
          required: true
        }]
      }]
    }],
    order: [['dominant_style', 'ASC']]
  });
};

module.exports = { submitVark, getVarkByUser, getAllVark, getVarkByStyle, getVarkByLocation };