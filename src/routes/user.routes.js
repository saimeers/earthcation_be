const router      = require('express').Router();
const auth        = require('../middleware/auth.middleware');
const requireRole = require('../middleware/role.middleware');
const userController = require('../controllers/user.controller');

router.get('/',     auth, requireRole('admin', 'instructor'), userController.getAll);
router.get('/:id',  auth, requireRole('admin', 'instructor'), userController.getById);
router.put('/:id',  auth, userController.update);
router.delete('/:id', auth, requireRole('admin'), userController.remove);

module.exports = router;