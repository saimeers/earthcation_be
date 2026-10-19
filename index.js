require('dotenv').config();

// Sin un secreto fuerte cualquiera podría firmar tokens válidos: no se arranca
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('❌ JWT_SECRET falta o tiene menos de 32 caracteres.');
  process.exit(1);
}

require('./src/server').start();
