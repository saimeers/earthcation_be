const router = require('express').Router();
const auth   = require('../middleware/auth.middleware');
const { getAll, getById } = require('../controllers/level.controller');

router.get('/',    auth, getAll);
router.get('/:id', auth, getById);

module.exports = router;