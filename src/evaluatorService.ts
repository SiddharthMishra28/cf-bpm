// src/evaluatorService.ts
import { getCachedRuleset, putCachedRuleset, getEvalCache, putEvalCache } from "./cache";
import { getRuleSet, insertAuditLog } from "./db";
import { evaluateRuleset } from "./ruleEngine";

export async function evaluateWithCache(env: any, ruleSetId: number, payload: any) {
  const cacheKeySuffix = `${ruleSetId}:${hashPayload(payload)}`; // small fingerprint
  const cachedEval = await getEvalCache(env, cacheKeySuffix);
  if (cachedEval) {
    await insertAuditLog(env, {
      ruleset_id: ruleSetId,
      short_hash: cacheKeySuffix,
      payload_snippet: JSON.stringify(payload).slice(0, 500),
      result_snippet: JSON.stringify(cachedEval).slice(0, 500)
    });
    return { fromCache: true, result: cachedEval };
  }

  // load compiled ruleset from KV or D1
  let compiled = await getCachedRuleset(env, String(ruleSetId));
  if (!compiled) {
    const rs = await getRuleSet(env, ruleSetId);
    if (!rs) throw new Error("ruleset_not_found");
    compiled = rs.rule_json;
    await putCachedRuleset(env, String(ruleSetId), compiled);
  }

  const result = evaluateRuleset(payload, compiled);
  // cache evaluation result for short time
  await putEvalCache(env, cacheKeySuffix, result, 60); // 60s
  await insertAuditLog(env, {
    ruleset_id: ruleSetId,
    short_hash: cacheKeySuffix,
    payload_snippet: JSON.stringify(payload).slice(0, 500),
    result_snippet: JSON.stringify(result).slice(0, 500)
  });
  return { fromCache: false, result };
}

function hashPayload(p: any) {
  // simple stable hash: JSON stringify; could be improved to canonical form
  try {
    return String(Math.abs(hashCode(JSON.stringify(p))));
  } catch {
    return "0";
  }
}

function hashCode(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}
