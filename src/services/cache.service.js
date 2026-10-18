const { getRedis } = require('../config/redis');

/**
 * Small cache for read data (copied from gameploy), on Redis when available and in memory
 * otherwise (development, tests, or Redis down).
 *
 * Keys live in namespaces with a version number: bump(namespace) increments
 * it, which makes every older key of that namespace unreachable at once (they
 * expire on their own), without scanning for keys.
 *
 * Values are stored as JSON, so callers always get a fresh copy they can
 * change without touching the cache.
 */

const memory = new Map(); // key -> { value: string, expires: number }

const memGet = (key) => {
  const hit = memory.get(key);
  if (!hit) return null;
  if (hit.expires <= Date.now()) {
    memory.delete(key);
    return null;
  }
  return hit.value;
};

const memSet = (key, value, ttlSeconds) => {
  if (memory.size > 5000) memory.clear(); // crude bound; it is only a cache
  memory.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
};

const toJson = (value) =>
  JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));

const get = async (key) => {
  const redis = getRedis();
  if (!redis) return memGet(key);
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
};

const set = async (key, value, ttlSeconds) => {
  const redis = getRedis();
  if (!redis) return memSet(key, value, ttlSeconds);
  try {
    await redis.set(key, value, 'EX', ttlSeconds);
  } catch { /* without cache this time */ }
};

const versionOf = async (namespace) => (await get(`cachever:${namespace}`)) ?? '0';

/**
 * Value of `key` in `namespace`, computing it with `fn` on a miss.
 * @template T
 * @param {string} namespace
 * @param {string} key
 * @param {number} ttlSeconds
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
const remember = async (namespace, key, ttlSeconds, fn) => {
  const fullKey = `cache:${namespace}:v${await versionOf(namespace)}:${key}`;
  const cached = await get(fullKey);
  if (cached !== null) return JSON.parse(cached);

  const value = await fn();
  const json = toJson(value);
  await set(fullKey, json, ttlSeconds);
  return JSON.parse(json);
};

/** Invalidate everything cached in these namespaces. */
const bump = async (...namespaces) => {
  const redis = getRedis();
  await Promise.all(namespaces.map(async (namespace) => {
    const key = `cachever:${namespace}`;
    if (!redis) {
      const next = String(Number(memGet(key) ?? 0) + 1);
      return memSet(key, next, 7 * 24 * 3600);
    }
    try {
      await redis.multi().incr(key).expire(key, 7 * 24 * 3600).exec();
    } catch { /* entries still expire on their own */ }
  }));
};

/**
 * Set `key` for `ttlSeconds` unless it already exists.
 * @returns {Promise<boolean>} true if it was set now. If Redis fails, true.
 */
const setIfAbsent = async (key, ttlSeconds) => {
  const redis = getRedis();
  if (!redis) {
    if (memGet(key) !== null) return false;
    memSet(key, '1', ttlSeconds);
    return true;
  }
  try {
    return (await redis.set(key, '1', 'EX', ttlSeconds, 'NX')) === 'OK';
  } catch {
    return true;
  }
};

const _resetForTests = () => memory.clear();

module.exports = { remember, bump, setIfAbsent, _resetForTests };
