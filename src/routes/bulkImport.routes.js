const router = require('express').Router();
const multer = require('multer');
const auth = require('../middleware/auth.middleware');
const requireRole = require('../middleware/role.middleware');
const bulkImportController = require('../controllers/bulkImport.controller');

// En memoria — el archivo solo se parsea, no se guarda en disco.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/parse',   auth, requireRole('admin', 'instructor'), upload.single('file'), bulkImportController.parse);
router.post('/confirm', auth, requireRole('admin', 'instructor'), bulkImportController.confirm);

module.exports = router;
