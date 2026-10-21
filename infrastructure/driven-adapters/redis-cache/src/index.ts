// API pública del adaptador de caché (Redis con respaldo en memoria)
export { createRedisClient, type Redis } from './redisClient'
export { RedisCache } from './RedisCache'
export { RedisWindowCounter, type WindowHits } from './RedisWindowCounter'
