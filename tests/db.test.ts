import { insertRuleSet, getRuleSet, listRuleSets } from "../src/db";
import { test, expect } from 'vitest';

const fakeEnv = {
  DB: {
    prepare: () => ({
      bind: () => ({
        run: async () => ({ success: true }),
        first: async () => ({ id: 1, name: "Demo", description: "ok", rule_json: "{}" }),
      }),
      all: async () => ({ results: [{ id: 1, name: "Demo" }] })
    })
  }
};

test("insertRuleSet and listRuleSets", async () => {
  await insertRuleSet(fakeEnv as any, "Demo", "Test", {});
  const list = await listRuleSets(fakeEnv as any);
  expect(Array.isArray(list)).toBe(true);
});

test("getRuleSet returns parsed JSON", async () => {
  const rs = await getRuleSet(fakeEnv as any, 1);
  expect(typeof rs.rule_json).toBe("object");
});
