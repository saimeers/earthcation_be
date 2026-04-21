const levelService = require('../services/level.service');

const getAll = async (req, res, next) => {
  try {
    const levels = await levelService.getAllLevels();
    res.json(levels);
  } catch (err) {
    next(err);
  }
};

const getById = async (req, res, next) => {
  try {
    const level = await levelService.getLevelById(req.params.id);
    res.json(level);
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getById };