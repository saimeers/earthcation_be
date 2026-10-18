const router            = require('express').Router();
const auth              = require('../middleware/auth.middleware');
const requireRole       = require('../middleware/role.middleware');
const sessionController = require('../controllers/session.controller');

router.post('/',            auth, requireRole('instructor', 'admin'), sessionController.create);
router.post('/join',        auth, sessionController.join);
// El juego valida el código que llegó por QR y muestra el nombre de la sala (sin inscribir al jugador)
router.get('/code/:code',   auth, sessionController.getByCode);
router.get('/mine',         auth, requireRole('instructor', 'admin', 'developer'), sessionController.getMySessions);
router.get('/all',          auth, requireRole('admin', 'developer'), sessionController.getAll);
router.get('/by-location',    auth, requireRole('instructor', 'admin', 'developer'), sessionController.getByLocation);
router.patch('/:id/start',  auth, requireRole('instructor', 'admin'), sessionController.start);
router.patch('/:id/end',    auth, requireRole('instructor', 'admin'), sessionController.end);
router.get('/:id/progress', auth, requireRole('instructor', 'admin', 'developer'), sessionController.getProgress);
// Detalle completo, análisis y Excel: admin todo; instructor solo sus salas y su "Juego libre" (assertCanView)
router.get('/:id/progress/admin', auth, requireRole('instructor', 'admin', 'developer'), sessionController.getProgressAdmin)
router.get('/:id/participants/:userId/analysis', auth, requireRole('instructor', 'admin', 'developer'), sessionController.getParticipantAnalysis)
router.get('/:id/export.xlsx',    auth, requireRole('instructor', 'admin', 'developer'), sessionController.exportXlsx)

module.exports = router;