// src/rulesController.ts
import { insertRuleSet, getRuleSet } from "./db";
import { putCachedRuleset, delCachedRuleset } from "./cache";

export async function createOrUpdateRuleSet(env: any, id: number | null, name: string, description: string, ruleJson: any) {
  if (id) {
    // update path: simple demo uses delete + insert (or use UPDATE in real implementation)
    // after D1 update, invalidate KV cache
    // (Assume you have an updateRuleSet function; otherwise replace with insert behavior)
    await env.DB.prepare(`UPDATE rule_sets SET name=?1, description=?2, rule_json=?3 WHERE id=?4`)
      .bind(name, description, JSON.stringify(ruleJson), id)
      .run();
    await delCachedRuleset(env, String(id));
    return { ok: true, id };
  } else {
    // insert
    const res = await env.DB.prepare(`INSERT INTO rule_sets (name, description, rule_json) VALUES (?1, ?2, ?3)`)
      .bind(name, description, JSON.stringify(ruleJson))
      .run();
    const insertedId = res?.lastRowId || null;
    if (insertedId) {
      // proactively cache compiled representation
      await putCachedRuleset(env, String(insertedId), ruleJson);
    }
    return { ok: true, id: insertedId };
  }
}
