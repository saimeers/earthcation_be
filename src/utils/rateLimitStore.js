/**
 * express-rate-limit store on Redis, so counters survive deploys and are
 * shared if the API ever runs on several instances. Errors are thrown and
 * the limiter is configured with passOnStoreError, so a Redis outage lets
 * requests through instead of blocking the API.
 */
class RedisRateLimitStore {
  constructor(client, prefix) {
    this.client = client;
    this.prefix = prefix;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  async increment(key) {
    const k = this.prefix + key;
    // SET ... NX starts the window on the first hit of each period; INCR keeps
    // the expiry. All three run atomically.
    const results = await this.client
      .multi().set(k, 0, 'PX', this.windowMs, 'NX').incr(k).pttl(k).exec();
    const failed = results.find(([err]) => err);
    if (failed) throw failed[0];
    const [, [, hits], [, ttl]] = results;
    return { totalHits: hits, resetTime: new Date(Date.now() + (ttl > 0 ? ttl : this.windowMs)) };
  }

  async decrement(key) {
    await this.client.decr(this.prefix + key);
  }

  async resetKey(key) {
    await this.client.del(this.prefix + key);
  }
}

module.exports = { RedisRateLimitStore };
