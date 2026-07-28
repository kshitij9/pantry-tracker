import crypto from "node:crypto";

/**
 * Symmetric encryption for secrets at rest (currently Gmail OAuth refresh
 * tokens). AES-256-GCM gives us confidentiality + integrity (the auth tag
 * detects tampering). Node-only — never import into edge code.
 *
 * Key: ENCRYPTION_KEY must be 32 bytes as 64 hex chars. Generate once with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 * Store it in .env and your host's env. Rotating it invalidates existing
 * ciphertexts (users would need to reconnect Gmail).
 */

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error("ENCRYPTION_KEY is not set. Generate 32 bytes of hex. See .env.example.");
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters).");
  }
  return key;
}

/** Encrypt a UTF-8 string. Returns "iv:tag:ciphertext" (all hex). */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12); // 96-bit nonce, standard for GCM
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

/** Decrypt a value produced by `encrypt`. Throws if tampered or key is wrong. */
export function decrypt(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Malformed ciphertext (expected iv:tag:ciphertext).");
  }
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
