const { Sequelize } = require('sequelize');

const isProduction = process.env.NODE_ENV === 'production';

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    dialectOptions: isProduction
      ? {
          ssl: {
            require: true,
            rejectUnauthorized: false
          }
        }
      : {},
    logging: false,
    // Por defecto Sequelize abre máx. 5 conexiones: con ~50 jugadores escribiendo a la vez las
    // peticiones hacían cola. Railway Postgres admite ~100; dejamos margen para otras réplicas.
    pool: {
      max: Number(process.env.DB_POOL_MAX) || 20,
      min: Number(process.env.DB_POOL_MIN) || 2,
      idle: 10000,
      acquire: 30000,
    }
  }
);

module.exports = sequelize;