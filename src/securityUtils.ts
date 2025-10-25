// src/securityUtils.ts
/**
 * Uses Web Crypto API (available in Workers) to compute SHA-256
 * and return hex string.
 */
export async function sha256Hex(input: string) {
  const enc = new TextEncoder();
  const data = enc.encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Create salt + hash for a plaintext API key.
 * Returns { salt, hash }.
 */
export async function createKeyHash(plainKey: string) {
  const salt = await sha256Hex(String(Math.random()) + Date.now().toString());
  const hash = await sha256Hex(salt + plainKey);
  return { salt, hash };
}

/**
 * Verify plaintext key against stored salt+hash
 */
export async function verifyKey(plainKey: string, salt: string, expectedHash: string) {
  const calc = await sha256Hex(salt + plainKey);
  return calc === expectedHash;
}
