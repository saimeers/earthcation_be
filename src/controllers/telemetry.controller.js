const telemetryService = require('../services/telemetry.service');

const startAttempt = async (req, res, next) => {
  try {
    const { level_key, session_id, vark_style, gas_brand, game_version } = req.body;
    if (!level_key) return res.status(400).json({ error: 'level_key es requerido' });
    const attempt = await telemetryService.startAttempt(req.user.id, { level_key, session_id, vark_style, gas_brand, game_version });
    res.status(201).json({ message: 'Intento iniciado', attempt });
  } catch (err) { next(err); }
};

const endAttempt = async (req, res, next) => {
  try {
    const attempt = await telemetryService.endAttempt(req.user.id, req.params.id, req.body || {});
    res.json({ message: 'Intento actualizado', attempt });
  } catch (err) { next(err); }
};

const saveEvents = async (req, res, next) => {
  try {
    const { attempt_id, events } = req.body;
    if (!attempt_id) return res.status(400).json({ error: 'attempt_id es requerido' });
    if (!Array.isArray(events) || events.length === 0) return res.status(400).json({ error: 'events debe ser un arreglo no vacío' });
    if (events.some(e => !e || !e.event_type)) return res.status(400).json({ error: 'cada evento requiere event_type' });
    const saved = await telemetryService.saveEvents(req.user.id, attempt_id, events);
    res.status(201).json({ message: 'Eventos guardados', saved });
  } catch (err) { next(err); }
};

const myAttempts = async (req, res, next) => {
  try {
    res.json(await telemetryService.listAttempts(req.user.id, req.query));
  } catch (err) { next(err); }
};

const userAttempts = async (req, res, next) => {
  try {
    res.json(await telemetryService.listAttempts(req.params.userId, req.query));
  } catch (err) { next(err); }
};

const attemptDetail = async (req, res, next) => {
  try {
    res.json(await telemetryService.getAttemptDetail(req.params.id));
  } catch (err) { next(err); }
};

const userSummary = async (req, res, next) => {
  try {
    res.json(await telemetryService.getUserSummary(req.params.userId, req.query));
  } catch (err) { next(err); }
};

const overview = async (req, res, next) => {
  try {
    res.json(await telemetryService.getOverview(req.query));
  } catch (err) { next(err); }
};

module.exports = { startAttempt, endAttempt, saveEvents, myAttempts, userAttempts, attemptDetail, userSummary, overview };
