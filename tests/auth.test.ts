import { createKeyHash, sha256Hex } from "../src/securityUtils";
import { requireApiKey } from "../src/auth";
import { test, expect } from 'vitest';

test("create and verify api key", async () => {
  const plain = "secret-abc-123";
  const { salt, hash } = await createKeyHash(plain);
  // simulate DB row
  const fakeEnv = {
    DB: {
      prepare: () => ({
        bind: () => ({ first: async () => ({ id: 1, name: "t", key_hash: hash, salt, role: "admin" }) })
      })
    }
  } as any;
  const fakeReq = new Request("https://a/", { headers: { Authorization: `ApiKey id=1,key=${plain}` } });
  const res = await requireApiKey(fakeReq, fakeEnv as any);
  expect(res.ok).toBe(true);
  expect(res.key.role).toBe("admin");
});
