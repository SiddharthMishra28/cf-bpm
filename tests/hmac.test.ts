import { signPayload } from "../src/hmac";
import { test, expect } from 'vitest';

test("hmac signing", async () => {
  const secret = "my-secret";
  const payload = { a: 1, b: "hello" };
  const signature = await signPayload(secret, payload);
  // SHA-256 HMACs are 32 bytes, which is 64 hex characters.
  expect(signature).toMatch(/^[a-f0-9]{64}$/);
});
