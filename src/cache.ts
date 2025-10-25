// src/cache.ts
export interface Env {
  RULES_CACHE: KVNamespace;
}

const TTL_SECONDS = 3600; // default 1 hour

export async function getCachedRuleset(env: Env, rulesetId: string) {
  const key = `ruleset:compiled:${rulesetId}`;
  const v = await env.RULES_CACHE.get(key, { type: "json" });
  return v || null;
}

export async function putCachedRuleset(env: Env, rulesetId: string, compiled: any, ttlSeconds = TTL_SECONDS) {
  const key = `ruleset:compiled:${rulesetId}`;
  // store JSON; KV auto-stringifies when using json type on put
  await env.RULES_CACHE.put(key, JSON.stringify(compiled), { expirationTtl: ttlSeconds });
}

export async function delCachedRuleset(env: Env, rulesetId: string) {
  const key = `ruleset:compiled:${rulesetId}`;
  await env.RULES_CACHE.delete(key);
}

// small LRU-like cache for last evaluation results
export async function putEvalCache(env: Env, keySuffix: string, value: any, ttlSeconds = 300) {
  const key = `eval:${keySuffix}`;
  await env.RULES_CACHE.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
}

export async function getEvalCache(env: Env, keySuffix: string) {
  const key = `eval:${keySuffix}`;
  const v = await env.RULES_CACHE.get(key, { type: "json" });
  return v || null;
}
