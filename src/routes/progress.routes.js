const router = require('express').Router();
const auth   = require('../middleware/auth.middleware');
const { save, getFullMeProgress, getSessionProgress, getProgressByLevel, getHistoryByUser } = require('../controllers/progress.controller');

router.post('/save',           auth, save);
router.get('/full',              auth, getFullMeProgress);
router.get('/me/:id',              auth, getSessionProgress);
router.get('/level/:levelId',  auth, getProgressByLevel);
router.get('/user/:userId/history', auth, requireRole('admin', 'instructor'), getHistoryByUser)

module.exports = router;