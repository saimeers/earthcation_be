const progressService = require('../services/progress.service');

const save = async (req, res, next) => {
  try {
    const { risk_id, is_mitigated, mistakes_count, reaction_time_ms } = req.body;

    if (!risk_id) {
      return res.status(400).json({ error: 'risk_id es requerido' });
    }

    const progress = await progressService.saveProgress(req.user.id, {
      risk_id, is_mitigated, mistakes_count, reaction_time_ms
    });

    res.status(201).json({ message: 'Progreso guardado', progress });
  } catch (err) {
    next(err);
  }
};

const getMyProgress = async (req, res, next) => {
  try {
    const progress = await progressService.getFullProgress(req.user.id);
    res.json({ user_id: req.user.id, total_attempts: progress.length, progress });
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

module.exports = { save, getMyProgress, getProgressByLevel };