const path = require('path');

// Entorno de pruebas: BD propia (.env.test o variables del CI), sin Redis, sin correos reales.
// Se carga antes de requerir cualquier módulo de src/ (database.js lee process.env al importarse).
const loadTestEnv = () => {
  require('dotenv').config({ path: path.join(__dirname, '../../../../.env.test'), quiet: true });
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET ||= 'test-only-secret-0123456789abcdef0123456789abcdef';
  process.env.RESEND_API_KEY ||= 're_test_sin_envio';
  process.env.VISITS_INGEST_SECRET = 'secreto-de-ingesta-de-prueba';
  process.env.DEPLOY_UPLOAD_TOKEN = 'token-de-despliegue-de-prueba-0123456789abcdef';
  delete process.env.REDIS_URL;
  // Despliegue siempre en disco, en una carpeta temporal por proceso: nunca contra S3 ni R2 reales
  for (const name of ['AWS_S3_BUCKET', 'R2_BUCKET', 'PLAY_SIGNING_SECRET']) delete process.env[name];
  process.env.DEPLOY_LOCAL_DIR = require('fs').mkdtempSync(path.join(require('os').tmpdir(), 'earthcation-deploy-'));
  // Las pruebas borran y recrean el esquema: nunca contra una BD que no sea de pruebas
  if (!/test/i.test(process.env.DB_NAME || '')) {
    throw new Error(`DB_NAME="${process.env.DB_NAME}" no parece una BD de pruebas (debe contener "test")`);
  }
};

// Nunca se envía un correo real: los métodos del adaptador de Resend se reemplazan en su prototipo (el container lo
// instancia después) por no-ops que guardan lo "enviado" en outbox (las pruebas leen de ahí el token de restablecimiento)
const outbox = [];
const stubEmails = () => {
  const { ResendMailer } = require('@earthcation/resend-mailer');
  const stubs = { sendWelcome: 'sendWelcomeEmail', sendPasswordReset: 'sendPasswordResetEmail' };
  for (const [method, name] of Object.entries(stubs)) {
    ResendMailer.prototype[method] = async ({ name: username, ...message }) => { outbox.push({ name, username, ...message }); };
  }
};

loadTestEnv();
stubEmails();

module.exports = { loadTestEnv, outbox };
