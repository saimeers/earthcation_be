const { generateToken } = require('../../dist/legacy/utils/jwt.utils');

// Mismo payload que firma el login (username = cédula); evita pasar por los límites de intentos
const tokenFor = (user) => generateToken({ id: user.id, username: user.cedula, role: user.role });

module.exports = { tokenFor };
