const router         = require('express').Router()
const auth           = require('../middleware/auth.middleware')
const requireRole    = require('../middleware/role.middleware')
const userController = require('../controllers/user.controller')

router.get('/',              auth, requireRole('admin', 'instructor'), userController.getAll)
router.post('/',             auth, requireRole('admin'),               userController.createByAdmin)
router.get('/:id',           auth, requireRole('admin', 'instructor'), userController.getById)
router.get('/:id/sessions',  auth, requireRole('admin', 'instructor'), userController.getSessions)
router.put('/:id',           auth,                                     userController.update)
router.patch('/:id/disable', auth, requireRole('admin'),               userController.disable)
router.patch('/:id/enable',  auth, requireRole('admin'),               userController.enable)

module.exports = router