const { security } = require('../../dist/container');

// Mismo payload que firma el login (username = cédula); evita pasar por los límites de intentos
const tokenFor = (user) => security.tokens.sign({ id: user.id, username: user.cedula, role: user.role });

module.exports = { tokenFor };
