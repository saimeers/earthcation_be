const sessionService = require('../services/session.service');

const create = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre de la sesión es requerido' });
    const session = await sessionService.createSession(req.user.id, { name });
    res.status(201).json({ message: 'Sesión creada', session });
  } catch (err) { next(err); }
};

const join = async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'El código es requerido' });
    const result = await sessionService.joinSession(req.user.id, code);
    res.json(result);
  } catch (err) { next(err); }
};

const start = async (req, res, next) => {
  try {
    const session = await sessionService.startSession(req.params.id, req.user.id);
    res.json({ message: 'Sesión iniciada', session });
  } catch (err) { next(err); }
};

const end = async (req, res, next) => {
  try {
    const session = await sessionService.endSession(req.params.id, req.user.id);
    res.json({ message: 'Sesión finalizada', session });
  } catch (err) { next(err); }
};

const getProgress = async (req, res, next) => {
  try {
    const data = await sessionService.getSessionProgress(req.params.id, req.user.id);
    res.json(data);
  } catch (err) { next(err); }
};

const getMySessions = async (req, res, next) => {
  try {
    const sessions = await sessionService.getMySessions(req.user.id);
    res.json(sessions);
  } catch (err) { next(err); }
};

const getByLocation = async (req, res, next) => {
  try {
    const { department, municipality } = req.query;
    const sessions = await sessionService.getSessionsByLocation({ department, municipality });
    res.json(sessions);
  } catch (err) { next(err); }
};

const getAll = async (req, res, next) => {
  try {
    const sessions = await sessionService.getAllSessions();
    res.json(sessions);
  } catch (err) { next(err); }
}

const getProgressAdmin = async (req, res, next) => {
  try {
    const data = await sessionService.getSessionProgressAdmin(req.params.id)
    res.json(data)
  } catch (err) { next(err) }
}

module.exports = { getAll, create, join, start, end, getProgress, getMySessions, getByLocation, getProgressAdmin };