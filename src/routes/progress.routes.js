const router = require('express').Router();
const auth   = require('../middleware/auth.middleware');
const { save, getFullMeProgress, getSessionProgress, getProgressByLevel } = require('../controllers/progress.controller');

router.post('/save',           auth, save);
router.get('/full',              auth, getFullMeProgress);
router.get('/me/:id',              auth, getSessionProgress);
router.get('/level/:levelId',  auth, getProgressByLevel);

module.exports = router;