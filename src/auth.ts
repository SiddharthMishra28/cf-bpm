// src/auth.ts
import type { Env } from "./db";
import { verifyKey } from "./securityUtils";

/**
 * Expect header: Authorization: ApiKey <plaintext-key>
 * The middleware will:
 * - extract plaintext key
 * - search DB for a matching hash (compute hash(salt+key) for each stored salt? -> we avoid scanning DB)
 *
 * Implementation detail:
 * - Rather than scanning DB and computing for each row (expensive), we assume we store only hash(salt+key).
 * - To avoid full-table scan, we require clients to present their key ID in header:
 *   Authorization: ApiKey id=<keyId>,key=<plaintext>
 *
 * This reduces DB scanning and provides direct lookup by id.
 */

export async function requireApiKey(req: Request, env: Env, requiredRoles: string[] = []) {
  const auth = req.headers.get("Authorization");
  if (!auth) return { ok: false, status: 401, body: { error: "missing_auth" } };

  // parse header "ApiKey id=123,key=abcdef..."
  if (!auth.startsWith("ApiKey ")) return { ok: false, status: 401, body: { error: "invalid_auth_scheme" } };

  const payload = auth.slice("ApiKey ".length);
  // parse pair string
  const parts = Object.fromEntries(payload.split(",").map(p => {
    const [k,v] = p.split("=");
    return [k.trim(), v?.trim()];
  }));

  const keyId = Number(parts["id"]);
  const plain = parts["key"];
  if (!keyId || !plain) return { ok: false, status: 401, body: { error: "invalid_auth_format" } };

  const keyRow = await env.DB.prepare(`SELECT * FROM api_keys WHERE id = ?1`).bind(keyId).first();
  if (!keyRow) return { ok: false, status: 403, body: { error: "unknown_key" } };

  const ok = await verifyKey(plain, keyRow.salt, keyRow.key_hash);
  if (!ok) return { ok: false, status: 403, body: { error: "invalid_key" } };

  // role check
  if (requiredRoles.length && !requiredRoles.includes(keyRow.role)) {
    return { ok: false, status: 403, body: { error: "insufficient_role" } };
  }

  // success -> return caller info
  return { ok: true, key: { id: keyRow.id, name: keyRow.name, role: keyRow.role } };
}
