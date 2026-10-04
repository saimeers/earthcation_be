const router      = require('express').Router();
const auth        = require('../middleware/auth.middleware');
const requireRole = require('../middleware/role.middleware');
const c           = require('../controllers/telemetry.controller');

// Escritura — la usa el juego (cualquier usuario autenticado, sobre sus propios intentos)
router.post('/attempts',       auth, c.startAttempt);
router.patch('/attempts/:id',  auth, c.endAttempt);
router.post('/events',         auth, c.saveEvents);
router.get('/me/attempts',     auth, c.myAttempts);

// Lectura — panel web
router.get('/overview',               auth, requireRole('admin', 'instructor'), c.overview);
router.get('/users/:userId/attempts', auth, requireRole('admin', 'instructor'), c.userAttempts);
router.get('/users/:userId/summary',  auth, requireRole('admin', 'instructor'), c.userSummary);
router.get('/attempts/:id',           auth, requireRole('admin', 'instructor'), c.attemptDetail);

module.exports = router;
