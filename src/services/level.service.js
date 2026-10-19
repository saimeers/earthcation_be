const { Level } = require('../models');

const getAllLevels = async () => {
  return Level.findAll({ include: [{ association: 'risks' }] });
};

const getLevelById = async (id) => {
  const level = await Level.findByPk(id, {
    include: [{ association: 'risks' }]
  });
  if (!level) {
    const error = new Error('Nivel no encontrado');
    error.status = 404;
    throw error;
  }
  return level;
};

module.exports = { getAllLevels, getLevelById };