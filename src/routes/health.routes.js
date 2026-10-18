const router      = require('express').Router();
const auth        = require('../middleware/auth.middleware');
const requireRole = require('../middleware/role.middleware');
const { getHealth } = require('../services/health.service');

// Detalle para el panel (Salud del servicio): BD, Redis, pool y métricas de las últimas 15 min
router.get('/details', auth, requireRole('admin'), async (req, res, next) => {
  try { res.json(await getHealth({ withMetrics: true })); } catch (err) { next(err); }
});

module.exports = router;
