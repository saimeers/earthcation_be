const express          = require('express');
const router           = express.Router();
const auth             = require('../middleware/auth.middleware');
const requireRole      = require('../middleware/role.middleware');
const deployController = require('../controllers/deploy.controller');

// Despliegue del juego: desarrollador y admin (ver services/deploy.service.js)
router.use(auth, requireRole('admin', 'developer'));

router.get('/status',                deployController.status);
router.get('/versions',              deployController.list);
router.post('/versions',             deployController.create);
// Solo sin S3 (desarrollo): el ZIP llega a la API; con S3 el navegador lo sube a la URL prefirmada
router.put('/versions/:id/upload',
  express.raw({ type: ['application/zip', 'application/octet-stream'], limit: `${Number(process.env.DEPLOY_MAX_MB) || 500}mb` }),
  deployController.upload);
router.post('/versions/:id/complete', deployController.complete);
router.post('/versions/:id/activate', deployController.activate);
router.get('/versions/:id/preview',   deployController.preview);
router.delete('/versions/:id',        deployController.remove);

module.exports = router;
