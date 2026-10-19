const path = require('path');

// Entorno de pruebas: BD propia (.env.test o variables del CI), sin Redis, sin correos reales.
// Se carga antes de requerir cualquier módulo de src/ (database.js lee process.env al importarse).
const loadTestEnv = () => {
  require('dotenv').config({ path: path.join(__dirname, '../../.env.test'), quiet: true });
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET ||= 'test-only-secret-0123456789abcdef0123456789abcdef';
  process.env.RESEND_API_KEY ||= 're_test_sin_envio';
  delete process.env.REDIS_URL;
  // Las pruebas borran y recrean el esquema: nunca contra una BD que no sea de pruebas
  if (!/test/i.test(process.env.DB_NAME || '')) {
    throw new Error(`DB_NAME="${process.env.DB_NAME}" no parece una BD de pruebas (debe contener "test")`);
  }
};

// Los servicios desestructuran las funciones de correo al importarse: se reemplazan antes por no-ops
const stubEmails = () => {
  const email = require('../../dist/src/utils/email.utils');
  for (const name of Object.keys(email)) email[name] = async () => ({ id: 'correo-de-prueba' });
};

loadTestEnv();
stubEmails();

module.exports = { loadTestEnv };
