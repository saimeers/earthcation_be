const sessionService = require('../services/session.service');
const { buildSessionWorkbook } = require('../services/sessionExport.service');

const create = async (req, res, next) => {
  try {
    const { name, location_id } = req.body;
    
    if (!name) return res.status(400).json({ error: 'El nombre de la sesión es requerido' });
    if (!location_id) return res.status(400).json({ error: 'La localidad (location_id) es requerida' }); // <-- VALIDACIÓN
    
    const session = await sessionService.createSession(req.user.id, { name, location_id });
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

const getParticipantAnalysis = async (req, res, next) => {
  try {
    res.json(await sessionService.getParticipantAnalysis(req.params.id, req.params.userId))
  } catch (err) { next(err) }
}

const exportXlsx = async (req, res, next) => {
  try {
    const { workbook, session } = await buildSessionWorkbook(req.params.id)
    const date = new Date().toISOString().slice(0, 10)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="sesion-${session.code}-${date}.xlsx"`)
    await workbook.xlsx.write(res)
    res.end()
  } catch (err) { next(err) }
}

module.exports = { getParticipantAnalysis, exportXlsx, getAll, create, join, start, end, getProgress, getMySessions, getByLocation, getProgressAdmin };