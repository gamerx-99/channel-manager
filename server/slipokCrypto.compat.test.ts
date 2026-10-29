import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptSlipOkKey, encryptSlipOkKey, hashSlipOkKey } from "./slipokCrypto";

const ALGORITHM_NODE = "aes-256-gcm";
const IV_LENGTH = 12;

function encryptSlipOkKeyNode(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM_NODE, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${encrypted.toString("hex")}:${tag.toString("hex")}`;
}

function decryptSlipOkKeyNode(stored: string, keyHex: string): string {
  const parts = stored.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted key format.");
  const [ivHex, ctHex, tagHex] = parts;
  const key = Buffer.from(keyHex, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const ct = Buffer.from(ctHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM_NODE, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ct) + decipher.final("utf8");
}

function hashSlipOkKeyNode(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

describe("SlipOK WebCrypto / Node format compatibility", () => {
  const TEST_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  let previousKey: string | undefined;

  beforeEach(() => {
    previousKey = process.env.SLIPOK_ENCRYPTION_KEY;
    process.env.SLIPOK_ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    if (previousKey !== undefined) {
      process.env.SLIPOK_ENCRYPTION_KEY = previousKey;
    } else {
      delete process.env.SLIPOK_ENCRYPTION_KEY;
    }
  });

  it("encrypting with old Node code decrypts with new WebCrypto decryptSlipOkKey", async () => {
    const plaintext = "slipok_api_secret_key_from_node_123";
    const encryptedNode = encryptSlipOkKeyNode(plaintext, TEST_KEY);
    const decryptedWeb = await decryptSlipOkKey(encryptedNode);
    expect(decryptedWeb).toBe(plaintext);
  });

  it("encrypting with new WebCrypto decrypts with old Node code", async () => {
    const plaintext = "slipok_api_secret_key_from_webcrypto_456";
    const encryptedWeb = await encryptSlipOkKey(plaintext);
    const decryptedNode = decryptSlipOkKeyNode(encryptedWeb, TEST_KEY);
    expect(decryptedNode).toBe(plaintext);
  });

  it("matches the fixed known-answer vector exactly", async () => {
    // Vector generated once with fixed key, IV and plaintext
    const knownKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const knownPlaintext = "slipok_secret_api_key_12345";
    const expectedStored = "00112233445566778899aabb:ce2a45e1678ae03cfe90d27674fc512f8e0e49f629d9970422cdb4:3071b5dd389e21434c495cbc32251b85";

    process.env.SLIPOK_ENCRYPTION_KEY = knownKey;
    const decrypted = await decryptSlipOkKey(expectedStored);
    expect(decrypted).toBe(knownPlaintext);

    // Verify node code also produces this exact string with the fixed IV
    const key = Buffer.from(knownKey, "hex");
    const iv = Buffer.from("00112233445566778899aabb", "hex");
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ct = Buffer.concat([cipher.update(knownPlaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    const generated = `${iv.toString("hex")}:${ct.toString("hex")}:${tag.toString("hex")}`;
    expect(generated).toBe(expectedStored);
  });

  it("rejects tampered tag or ciphertext", async () => {
    const plaintext = "sensitive_key";
    const stored = await encryptSlipOkKey(plaintext);
    const [iv, ct, tag] = stored.split(":");

    // Tampered ciphertext
    const tamperedCt = "ff" + ct.slice(2);
    await expect(decryptSlipOkKey(`${iv}:${tamperedCt}:${tag}`)).rejects.toThrow();

    // Tampered tag
    const tamperedTag = "ee" + tag.slice(2);
    await expect(decryptSlipOkKey(`${iv}:${ct}:${tamperedTag}`)).rejects.toThrow();

    // Malformed format
    await expect(decryptSlipOkKey("invalid_format")).rejects.toThrow("Invalid encrypted key format.");
  });

  it("throws for a wrong-length key without leaking the key in the error message", async () => {
    const badKey = "too_short_key_12345";
    process.env.SLIPOK_ENCRYPTION_KEY = badKey;

    await expect(encryptSlipOkKey("data")).rejects.toThrowError(
      "SLIPOK_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)."
    );

    try {
      await encryptSlipOkKey("data");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).not.toContain(badKey);
    }
  });

  it("hash matches the old createHash('sha256') output", async () => {
    const testStrings = [
      "slipok_key_123",
      "test_secret_abc_xyz",
      "",
      "A long string with special characters !@#$%^&*()_+",
    ];

    for (const str of testStrings) {
      const webHash = await hashSlipOkKey(str);
      const nodeHash = hashSlipOkKeyNode(str);
      expect(webHash).toBe(nodeHash);
      expect(webHash).toHaveLength(64);
    }
  });
});
