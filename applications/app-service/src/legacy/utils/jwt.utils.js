// Tokens de sesión del adaptador @earthcation/security (instancia del composition root, con el JWT_SECRET validado).
// Queda para el código v1 que aún no se migra (middleware de auth, límite de peticiones), la semilla de pruebas y
// scripts/load: firman y leen el payload completo.
const { security } = require('../../container');

const generateToken = (payload) => security.tokens.sign(payload);

const verifyToken = (token) => security.tokens.decode(token);

module.exports = { generateToken, verifyToken };
