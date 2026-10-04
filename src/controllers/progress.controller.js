const progressService = require('../services/progress.service');

const save = async (req, res, next) => {
  try {
    const { risk_id, session_id, attempt_id, is_mitigated, mistakes_count, reaction_time_ms, detail } = req.body;

    if (!risk_id) {
      return res.status(400).json({ error: 'risk_id es requerido' });
    }

    const progress = await progressService.saveProgress(req.user.id, {
      risk_id, session_id, attempt_id, is_mitigated, mistakes_count, reaction_time_ms, detail
    });

    res.status(201).json({ message: 'Progreso guardado', progress });
  } catch (err) {
    next(err);
  }
};

const getFullMeProgress = async (req, res, next) => {
  try {
    const progress = await progressService.getFullMeProgress(req.user.id);
    res.json({ user_id: req.user.id, total_attempts: progress.length, progress });
  } catch (err) {
    next(err);
  }
};

const getSessionProgress = async (req, res, next) => {
  try {
    const data = await progressService.getSessionProgress(req.params.id, req.user.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

const getProgressByLevel = async (req, res, next) => {
  try {
    const data = await progressService.getProgressByLevel(req.user.id, req.params.levelId);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

const getHistoryByUser = async (req, res, next) => {
  try {
    const { userId } = req.params
    const { session_id } = req.query
    const data = await progressService.getHistoryByUser(userId, session_id)
    res.json(data)
  } catch (err) { next(err) }
}

module.exports = { save, getFullMeProgress, getSessionProgress, getProgressByLevel, getHistoryByUser };