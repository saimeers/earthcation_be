const path = require('path');

// Entorno de pruebas: BD propia (.env.test o variables del CI), sin Redis, sin correos reales.
// Se carga antes de requerir cualquier módulo de src/ (database.js lee process.env al importarse).
const loadTestEnv = () => {
  require('dotenv').config({ path: path.join(__dirname, '../../.env.test'), quiet: true });
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET ||= 'test-only-secret-0123456789abcdef0123456789abcdef';
  process.env.RESEND_API_KEY ||= 're_test_sin_envio';
  process.env.VISITS_INGEST_SECRET = 'secreto-de-ingesta-de-prueba';
  delete process.env.REDIS_URL;
  // Despliegue siempre en disco, en una carpeta temporal por proceso: nunca contra S3 ni R2 reales
  for (const name of ['AWS_S3_BUCKET', 'R2_BUCKET', 'PLAY_SIGNING_SECRET']) delete process.env[name];
  process.env.DEPLOY_LOCAL_DIR = require('fs').mkdtempSync(path.join(require('os').tmpdir(), 'earthcation-deploy-'));
  // Las pruebas borran y recrean el esquema: nunca contra una BD que no sea de pruebas
  if (!/test/i.test(process.env.DB_NAME || '')) {
    throw new Error(`DB_NAME="${process.env.DB_NAME}" no parece una BD de pruebas (debe contener "test")`);
  }
};

// Los servicios desestructuran las funciones de correo al importarse: se reemplazan antes por no-ops que
// guardan lo "enviado" en email.outbox (las pruebas leen de ahí el token de restablecimiento)
const stubEmails = () => {
  const email = require('../../dist/src/utils/email.utils');
  const outbox = [];
  for (const name of Object.keys(email)) {
    email[name] = async (message) => { outbox.push({ name, ...message }); return { id: 'correo-de-prueba' }; };
  }
  email.outbox = outbox;
};

loadTestEnv();
stubEmails();

module.exports = { loadTestEnv };
