const router              = require('express').Router();
const auth                = require('../middleware/auth.middleware');
const requireRole         = require('../middleware/role.middleware');
const analyticsController = require('../controllers/analytics.controller');

router.get('/overview',            auth, requireRole('admin', 'developer'),               analyticsController.overview);
router.get('/organization/:orgId', auth, requireRole('instructor', 'admin', 'developer'), analyticsController.byOrganization);
router.get('/location',            auth, requireRole('instructor', 'admin', 'developer'), analyticsController.byLocation);
router.get('/map',                 auth, requireRole('instructor', 'admin', 'developer'), analyticsController.minesMap);

module.exports = router;