const varkService = require('../services/vark.service');

const submit = async (req, res, next) => {
  try {
    const { answers } = req.body;

    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ error: 'Se requiere el objeto answers' });
    }

    const { result, created } = await varkService.submitVark(req.user.id, answers);
    res.json({
      message: created ? 'Test VARK completado' : 'Test VARK actualizado',
      result
    });
  } catch (err) {
    next(err);
  }
};

const getMyVark = async (req, res, next) => {
  try {
    const result = await varkService.getVarkByUser(req.user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const getAll = async (req, res, next) => {
  try {
    const results = await varkService.getAllVark();
    res.json(results);
  } catch (err) { next(err); }
};

const getByStyle = async (req, res, next) => {
  try {
    const results = await varkService.getVarkByStyle(req.params.style);
    res.json(results);
  } catch (err) { next(err); }
};

const getByLocation = async (req, res, next) => {
  try {
    const { department, municipality } = req.query;
    const results = await varkService.getVarkByLocation({ department, municipality });
    res.json(results);
  } catch (err) { next(err); }
};

module.exports = { submit, getMyVark, getAll, getByStyle, getByLocation };