const router      = require('express').Router();
const auth        = require('../middleware/auth.middleware');
const requireRole = require('../middleware/role.middleware');
const c           = require('../controllers/organization.controller');

router.get('/',           auth, c.getAll);
router.get('/search',     auth, c.search);
router.get('/types',      auth, c.getTypes);
router.get('/:id',        auth, c.getById);

router.post('/',          auth, requireRole('admin', 'instructor'), c.create);
router.put('/:id',        auth, requireRole('admin', 'instructor'), c.update);
router.patch('/:id/disable', auth, requireRole('admin'), c.disable);
router.patch('/:id/enable',  auth, requireRole('admin'), c.enable);

module.exports = router;