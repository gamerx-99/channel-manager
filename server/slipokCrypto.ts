/**
 * Phase 01 — SlipOK API key encryption helpers.
 *
 * AES-256-GCM symmetric encryption using the Web Crypto API so the same code
 * runs on Cloudflare Workers and Node. The encryption key is derived from the
 * SLIPOK_ENCRYPTION_KEY env var (a 32-byte hex string, i.e. 64 hex chars).
 * Never stored; read at runtime.
 *
 * Format stored in DB: "<iv_hex>:<ciphertext_hex>:<authTag_hex>"
 * (authTag is the trailing 16 bytes of the GCM ciphertext produced by WebCrypto)
 */
const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getEncryptionKeyBytes(): Uint8Array {
  const raw = (typeof process !== "undefined" ? process.env?.SLIPOK_ENCRYPTION_KEY : "") ?? "";
  if (!/^[0-9a-f]{64}$/i.test(raw)) {
    throw new Error(
      "SLIPOK_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). " +
        'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function importKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", getEncryptionKeyBytes() as unknown as ArrayBuffer, { name: ALGORITHM }, false, ["encrypt", "decrypt"]);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function encryptSlipOkKey(plaintext: string): Promise<string> {
  const key = await importKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv: iv as unknown as ArrayBuffer, tagLength: TAG_LENGTH * 8 }, key, new TextEncoder().encode(plaintext) as unknown as ArrayBuffer);
  const buf = new Uint8Array(ciphertext);
  const ct = buf.slice(0, buf.byteLength - TAG_LENGTH);
  const tag = buf.slice(buf.byteLength - TAG_LENGTH);
  return `${toHex(iv)}:${toHex(ct)}:${toHex(tag)}`;
}

export async function decryptSlipOkKey(stored: string): Promise<string> {
  const parts = stored.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted key format.");
  const [ivHex, ctHex, tagHex] = parts;
  const key = await importKey();
  const iv = fromHex(ivHex);
  const ct = fromHex(ctHex);
  const tag = fromHex(tagHex);
  const combined = new Uint8Array(ct.byteLength + tag.byteLength);
  combined.set(ct, 0);
  combined.set(tag, ct.byteLength);
  const plain = await crypto.subtle.decrypt({ name: ALGORITHM, iv: iv as unknown as ArrayBuffer, tagLength: TAG_LENGTH * 8 }, key, combined as unknown as ArrayBuffer);
  return new TextDecoder().decode(plain);
}

export async function hashSlipOkKey(plaintext: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(plaintext) as unknown as ArrayBuffer);
  return toHex(new Uint8Array(digest));
}