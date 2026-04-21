const router = require('express').Router();
const auth   = require('../middleware/auth.middleware');
const { save, getMyProgress, getProgressByLevel } = require('../controllers/progress.controller');

router.post('/save',           auth, save);
router.get('/me',              auth, getMyProgress);
router.get('/level/:levelId',  auth, getProgressByLevel);

module.exports = router;