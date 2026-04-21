const router           = require('express').Router();
const auth             = require('../middleware/auth.middleware');
const requireRole      = require('../middleware/role.middleware');
const analyticsController = require('../controllers/analytics.controller');

router.get('/overview',            auth, requireRole('instructor', 'admin'), analyticsController.overview);
router.get('/organization/:orgId', auth, requireRole('instructor', 'admin'), analyticsController.byOrganization);
router.get('/location',            auth, requireRole('instructor', 'admin'), analyticsController.byLocation);

module.exports = router;