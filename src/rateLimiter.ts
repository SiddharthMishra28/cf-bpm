// src/rateLimiter.ts
import type { Env } from "./db";

/**
 * windowSeconds: e.g., 60
 * limit: number of requests allowed per window
 * key: string (e.g., apiKey:12 or ip:1.2.3.4)
 */
export async function checkRateLimit(env: Env, key: string, windowSeconds: number, limit: number) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / windowSeconds) * windowSeconds;

  // UPSERT: insert or increment count atomically
  const sql = `
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (?1, ?2, 1)
    ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1
  `;
  await env.DB.prepare(sql).bind(key, windowStart).run();

  // read the count to decide allow/deny
  const read = await env.DB.prepare(`SELECT count FROM rate_limits WHERE key = ?1 AND window_start = ?2`)
    .bind(key, windowStart).first();

  const count = read?.count ?? 0;
  const allowed = count <= limit;
  return { allowed, count, windowStart };
}
