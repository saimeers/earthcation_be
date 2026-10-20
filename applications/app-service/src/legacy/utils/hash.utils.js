// Contraseñas del adaptador @earthcation/security (bcrypt). Queda para la semilla de pruebas.
const { security } = require('../../container');

const hashPassword = (password) => security.passwords.hash(password);

const comparePassword = (plain, hashed) => security.passwords.matches(plain, hashed);

module.exports = { hashPassword, comparePassword };
