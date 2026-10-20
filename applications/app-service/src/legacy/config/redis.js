// El cliente de Redis (o null sin REDIS_URL) lo crea el composition root con @earthcation/redis-cache; el limitador
// de peticiones de legacy lo sigue pidiendo aquí
const container = require('../../container');

module.exports = { getRedis: () => container.redis };
