const authService = require('../services/auth.service');
const { recordLogin } = require('../contexts/observability');

const register = async (req, res, next) => {
  try {
    const { username, password, first_name, last_name, age, cedula, role, organization_id, location_id } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
    }
    const result = await authService.register({
      username, password, first_name, last_name, age, cedula, role, organization_id, location_id
    });
    res.status(201).json({ message: 'Usuario registrado exitosamente', ...result });
  } catch (err) { next(err); }
};

const login = async (req, res, next) => {
  try {
    const { cedula, password } = req.body;
    if (!cedula) {
      return res.status(400).json({ error: 'La cédula es requerida' });
    }
    const result = await authService.login({ cedula, password });
    recordLogin(req, result.user); // ubicación del login (no bloquea la respuesta)
    res.json({ message: 'Login exitoso', ...result });
  } catch (err) { next(err); }
};

const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'El email es requerido' });
    const result = await authService.forgotPassword(email);
    res.json(result);
  } catch (err) { next(err); }
};

const resetPassword = async (req, res, next) => {
  try {
    const { token, new_password } = req.body;
    if (!token || !new_password) return res.status(400).json({ error: 'Token y nueva contraseña son requeridos' });
    const result = await authService.resetPassword(token, new_password);
    res.json(result);
  } catch (err) { next(err); }
};

module.exports = { register, login, forgotPassword, resetPassword };