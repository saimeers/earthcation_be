const router = require('express').Router();
const { login, forgotPassword, resetPassword } = require('../controllers/auth.controller');

// Registro público deshabilitado — el alta de usuarios ahora es exclusiva del panel admin
// (creación manual o carga masiva por Excel, ver src/routes/user.routes.js).
router.post('/login',    login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password',  resetPassword);

module.exports = router;