import { Redis } from "ioredis";

type CacheEntry<T> = { value: T; expiresAt: number };

const localEntries = new Map<string, CacheEntry<unknown>>();
let redisClient: Redis | null = null;
let redisConnectionFailed = false;

export function getRedisClient(): Redis | null {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl || redisUrl.trim().length === 0) {
    return null;
  }

  if (redisConnectionFailed) {
    return null;
  }

  if (!redisClient) {
    try {
      redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy(times) {
          if (times > 3) {
            redisConnectionFailed = true;
            return null; // Stop retrying and fallback to local cache
          }
          return Math.min(times * 100, 2000);
        },
      });

      redisClient.on("error", (err) => {
        console.warn("[RedisCache] Redis client warning/error:", err.message);
      });
    } catch (err) {
      console.warn("[RedisCache] Failed to initialize Redis client, using local cache fallback:", err);
      redisConnectionFailed = true;
      redisClient = null;
    }
  }

  return redisClient;
}

export async function getOrSetScopedCache<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const redis = getRedisClient();

  if (redis) {
    try {
      const cachedStr = await redis.get(key);
      if (cachedStr !== null) {
        return JSON.parse(cachedStr) as T;
      }
    } catch (err) {
      console.warn(`[RedisCache] get failed for key "${key}", falling back to memory:`, err);
    }
  }

  // Local memory check
  const current = localEntries.get(key) as CacheEntry<T> | undefined;
  if (current && current.expiresAt > Date.now()) {
    return current.value;
  }

  const value = await loader();

  // Save to local memory
  localEntries.set(key, { value, expiresAt: Date.now() + Math.max(1, ttlMs) });

  // Async save to Redis if available
  if (redis) {
    try {
      await redis.set(key, JSON.stringify(value), "PX", Math.max(1, ttlMs));
    } catch (err) {
      console.warn(`[RedisCache] set failed for key "${key}":`, err);
    }
  }

  return value;
}

export async function invalidateScopedCache(prefix: string) {
  // Invalidate local memory cache
  for (const key of Array.from(localEntries.keys())) {
    if (key.startsWith(prefix)) {
      localEntries.delete(key);
    }
  }

  // Invalidate Redis cache
  const redis = getRedisClient();
  if (redis) {
    try {
      const keys = await redis.keys(`${prefix}*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (err) {
      console.warn(`[RedisCache] invalidate failed for prefix "${prefix}":`, err);
    }
  }
}

export function clearScopedCacheForTest() {
  localEntries.clear();
  redisConnectionFailed = false;
  if (redisClient) {
    try {
      redisClient.disconnect();
    } catch {
      // Ignore disconnect errors during test cleanup
    }
    redisClient = null;
  }
}
