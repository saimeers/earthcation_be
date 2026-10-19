const jwt = require('jsonwebtoken');

// Algoritmo fijo al verificar: así no se acepta un token firmado con otro (p. ej. "none")
const ALGORITHM = 'HS256';

const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d', algorithm: ALGORITHM });
};

const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET, { algorithms: [ALGORITHM] });
};

module.exports = { generateToken, verifyToken };
