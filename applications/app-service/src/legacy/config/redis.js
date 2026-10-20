const Redis = require('ioredis');

let client;

/**
 * Redis client when REDIS_URL is set, otherwise null and every user of it
 * falls back to memory. Commands fail fast instead of queueing while Redis is
 * unreachable, so the API keeps answering (without cache) if Redis goes down.
 */
const getRedis = () => {
  if (client !== undefined) return client;
  if (!process.env.REDIS_URL) return (client = null);

  client = new Redis(process.env.REDIS_URL, {
    family: 0,               // Railway's private network is IPv6
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 3000,
  });
  let warned = false;
  client.on('error', (err) => {
    if (!warned) console.error('Redis unavailable, falling back to memory:', err.message);
    warned = true;
  });
  client.on('ready', () => { warned = false; });
  return client;
};

/** For tests: use this client (or null) instead of REDIS_URL. */
const setRedisForTests = (fake) => { client = fake; };

module.exports = { getRedis, setRedisForTests };
