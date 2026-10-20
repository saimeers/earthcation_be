const { verifyToken } = require('../utils/jwt.utils');

module.exports = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticación requerido' });
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(403).json({ error: 'Token inválido o expirado' });
  }
};