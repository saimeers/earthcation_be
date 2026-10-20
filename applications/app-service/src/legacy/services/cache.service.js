// La caché (Redis con respaldo en memoria) vive en @earthcation/redis-cache y la instancia el composition root;
// los contextos de legacy la siguen usando con estas funciones
const { cache } = require('../../container');

/**
 * Valor de `key` en `namespace`, calculado con `fn` si no está.
 * @template T
 * @param {string} namespace
 * @param {string} key
 * @param {number} ttlSeconds
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
const remember = (namespace, key, ttlSeconds, fn) => cache.remember({ namespace, key, ttlSeconds }, fn);

/** Invalida todo lo guardado en estos namespaces. */
const bump = async (...namespaces) => { await Promise.all(namespaces.map((namespace) => cache.bump(namespace))); };

/** Pone `key` por `ttlSeconds` si no existe; true si quedó puesta ahora (si Redis falla, true). */
const setIfAbsent = (key, ttlSeconds) => cache.setIfAbsent(key, ttlSeconds);

module.exports = { remember, bump, setIfAbsent };
