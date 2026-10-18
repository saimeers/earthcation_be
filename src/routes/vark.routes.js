const router = require('express').Router();
const auth   = require('../middleware/auth.middleware');
const requireRole       = require('../middleware/role.middleware');
const { submit, getMyVark, getAll, getByStyle, getByLocation } = require('../controllers/vark.controller');

router.post('/submit', auth, submit);
router.get('/me',      auth, getMyVark);
router.get('/all',              auth, requireRole('instructor', 'admin', 'developer'), getAll);
router.get('/by-style/:style',  auth, requireRole('instructor', 'admin', 'developer'), getByStyle);
router.get('/by-location',      auth, requireRole('instructor', 'admin', 'developer'), getByLocation);

module.exports = router;