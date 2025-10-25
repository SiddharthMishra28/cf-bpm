import { getCachedRuleset, putCachedRuleset, delCachedRuleset } from "../src/cache";
import { test, expect } from 'vitest';

const fakeKV = {
  store: new Map<string, string>(),
  async get(key: string) {
    const v = this.store.get(key);
    return v ? JSON.parse(v) : null;
  },
  async put(key: string, val: string) {
    this.store.set(key, val);
  },
  async delete(key: string) {
    this.store.delete(key);
  }
};

test("put/get/del cache", async () => {
  const env = { RULES_CACHE: fakeKV as any };
  await putCachedRuleset(env as any, "42", { foo: "bar" }, 10);
  const v = await getCachedRuleset(env as any, "42");
  expect(v.foo).toBe("bar");
  await delCachedRuleset(env as any, "42");
  const v2 = await getCachedRuleset(env as any, "42");
  expect(v2).toBeNull();
});
