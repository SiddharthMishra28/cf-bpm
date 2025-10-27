import { createOrUpdateRuleSet, getLatestRuleSet, getRuleSetByVersion } from "../src/db";
import { test, expect } from 'vitest';

const fakeDb = {
  store: new Map<string, any>(),
  prepare: (sql: string) => ({
    bind: (...args: any[]) => ({
      run: async () => {
        if (sql.includes("INSERT INTO rule_sets")) {
          const name = args[0];
          const version = args[3];
          const key = `${name}:${version}`;
          fakeDb.store.set(key, { name, version_number: version, rule_json: args[2] });
        }
        return { success: true };
      },
      first: async () => {
        if (sql.includes("SELECT * FROM rule_sets")) {
          const name = args[0];
          let versions = Array.from(fakeDb.store.values()).filter(v => v.name === name);
          if (sql.includes("ORDER BY version_number DESC")) {
            versions = versions.sort((a, b) => b.version_number - a.version_number);
          }
          return versions[0] || null;
        }
        return null;
      }
    })
  })
};

const fakeEnv = {
  DB: fakeDb,
  API_CACHE: {
    get: async () => null,
    put: async () => {}
  }
};

test("create and get rule set versions", async () => {
  const name = "test-rule";
  const v1 = await createOrUpdateRuleSet(fakeEnv as any, name, "desc", { a: 1 });
  expect(v1).toBe(1);

  const v2 = await createOrUpdateRuleSet(fakeEnv as any, name, "desc", { a: 2 });
  expect(v2).toBe(2);

  const latest = await getLatestRuleSet(fakeEnv as any, name);
  expect(latest.version_number).toBe(2);

  const version1 = await getRuleSetByVersion(fakeEnv as any, name, 1);
  expect(version1.version_number).toBe(1);
});
