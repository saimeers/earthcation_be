const crypto = require('crypto');
const visitService = require('../services/visit.service');

const sameSecret = (a, b) => {
  const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b ?? ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Lo llama el Worker de play.earthcation.saimers.dev con el secreto compartido
const ingest = async (req, res, next) => {
  try {
    const secret = process.env.VISITS_INGEST_SECRET;
    if (!secret || !sameSecret(req.headers['x-ingest-secret'], secret)) return res.status(401).json({ error: 'No autorizado' });
    await visitService.ingest(req.body ?? {});
    res.status(204).end();
  } catch (err) { next(err); }
};

const stats = async (req, res, next) => {
  try {
    const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    res.json(await visitService.getStats(days));
  } catch (err) { next(err); }
};

module.exports = { ingest, stats };
