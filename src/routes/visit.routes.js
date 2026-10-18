const router          = require('express').Router();
const auth            = require('../middleware/auth.middleware');
const requireRole     = require('../middleware/role.middleware');
const visitController = require('../controllers/visit.controller');

// Sin token: lo protege x-ingest-secret (VISITS_INGEST_SECRET, compartido con el Worker)
router.post('/ingest', visitController.ingest);
router.get('/stats',   auth, requireRole('admin', 'developer'), visitController.stats);

module.exports = router;
