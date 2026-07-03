import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let cachedRedis: Redis | null = null;

function getRedis(): Redis | null {
  if (cachedRedis) return cachedRedis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedRedis = new Redis({ url, token });
  return cachedRedis;
}

export interface MakeLimiterOptions {
  tokens: number;
  window: `${number} ${"s" | "m" | "h" | "d"}`;
  /** Optional namespace prefix for the Redis key (e.g. "login", "api-search"). */
  prefix?: string;
}

export function makeLimiter(opts: MakeLimiterOptions): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(opts.tokens, opts.window),
    prefix: opts.prefix ?? "ratelimit",
    analytics: true,
  });
}

/**
 * Check whether the given identifier (IP, user id, etc) is allowed under the
 * given limiter. Returns true when no Upstash is configured (local dev).
 */
export async function isAllowed(identifier: string, limiter: Ratelimit | null): Promise<boolean> {
  if (!limiter) return true;
  const { success } = await limiter.limit(identifier);
  return success;
}
