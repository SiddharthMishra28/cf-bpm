import { checkRateLimit } from "../src/rateLimiter";
import { test, expect } from 'vitest';

const fakeDb = {
  store: new Map<string, any>(),
  prepare: (sql: string) => ({
    bind: (...args: any[]) => ({
      run: async () => {
        if (sql.includes("INSERT")) {
          const key = args[0];
          const windowStart = args[1];
          const storeKey = `${key}:${windowStart}`;
          if (fakeDb.store.has(storeKey)) {
            fakeDb.store.get(storeKey).count++;
          } else {
            fakeDb.store.set(storeKey, { key, window_start: windowStart, count: 1 });
          }
        }
        return { success: true };
      },
      first: async () => {
        const key = args[0];
        const windowStart = args[1];
        const storeKey = `${key}:${windowStart}`;
        return fakeDb.store.get(storeKey);
      }
    })
  })
};

const fakeEnv = {
  DB: fakeDb
};

test("rate limiter", async () => {
  const key = "test-key";
  const windowSeconds = 60;
  const limit = 5;

  for (let i = 0; i < limit; i++) {
    const res = await checkRateLimit(fakeEnv as any, key, windowSeconds, limit);
    expect(res.allowed).toBe(true);
  }

  const res = await checkRateLimit(fakeEnv as any, key, windowSeconds, limit);
  expect(res.allowed).toBe(false);
});
